import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, Database, PanelLeftClose, PanelLeftOpen, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getDataSourceFields, getDataSources } from '../api';

const VERIFIED_SOURCE_ALIAS = 'standardAndCustomReportsICanRun';
const VERIFIED_FIELDS = ['reportName', 'reportOwner', 'reportColumnAll', 'fieldsDisplayedOnReport'];

const TYPE_ICONS = {
  'Text': 'T',
  'Numeric': '#',
  'Date': '📅',
  'Boolean': '◉',
  'Single instance': '⬡',
  'Multi-instance': '⬡⬡',
};

const OPERATORS_BY_TYPE = {
  Text: ['=', '!=', 'contains'],
  Boolean: ['=', '!='],
  Numeric: ['=', '!=', '>', '<', '>=', '<='],
  Date: ['=', '!=', '>', '<', '>=', '<='],
};

function quoteValue(value, operator) {
  const trimmed = String(value).trim();
  if (!trimmed) return "''";
  if (/^(true|false|null)$/i.test(trimmed) || /^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) return trimmed;
  return `'${trimmed.replace(/'/g, "''")}'`;
}

function pickDefaultSource(sources) {
  return sources.find((s) => s.alias === VERIFIED_SOURCE_ALIAS) || sources.find((s) => s.alias) || null;
}

function pickDefaultFields(fields) {
  const aliases = fields.map((f) => f.alias).filter(Boolean);
  const verified = VERIFIED_FIELDS.filter((f) => aliases.includes(f));
  if (verified.length) return verified;
  return fields
    .filter((f) => ['Text', 'Boolean', 'Numeric', 'Date', 'Single instance', 'Multi-instance'].includes(f.type))
    .slice(0, 4)
    .map((f) => f.alias);
}

function isFilterableField(field) {
  return Boolean(field.alias && OPERATORS_BY_TYPE[field.type]);
}

function getOperatorsForField(fieldName, fields) {
  const field = fields.find((f) => f.value === fieldName);
  return OPERATORS_BY_TYPE[field?.type] || ['='];
}

function getDefaultFilter(fields) {
  const preferred = fields.find((f) => f.value === 'reportName') || fields[0];
  return { field: preferred?.value || '', operator: getOperatorsForField(preferred?.value, fields)[0] || '=', value: '' };
}

export default function QueryBuilder({ onExecute, isLoading, onCollapse, onExpand, collapsed }) {
  const [sources, setSources] = useState([]);
  const [fieldsMeta, setFieldsMeta] = useState([]);
  const [source, setSource] = useState('');
  const [selectedFields, setSelectedFields] = useState(VERIFIED_FIELDS);
  const [filters, setFilters] = useState([{ field: 'reportName', operator: 'contains', value: 'Employee' }]);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [wqlOpen, setWqlOpen] = useState(true);
  const [metadataError, setMetadataError] = useState(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingFields, setLoadingFields] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (sourceRef.current && !sourceRef.current.contains(e.target)) {
        setSourceOpen(false);
        setSourceSearch('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadSources() {
      setLoadingSources(true);
      setMetadataError(null);
      try {
        const result = await getDataSources();
        if (ignore) return;
        const available = result.data || [];
        setSources(available);
        const next = pickDefaultSource(available);
        if (next) setSource(next.alias);
      } catch (error) {
        if (!ignore) setMetadataError(error);
      } finally {
        if (!ignore) setLoadingSources(false);
      }
    }
    loadSources();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    let ignore = false;
    const selected = sources.find((s) => s.alias === source);
    if (!selected?.id) return;

    async function loadFields() {
      setLoadingFields(true);
      setMetadataError(null);
      try {
        const result = await getDataSourceFields(selected.id);
        if (ignore) return;
        const nextFields = result.data || [];
        setFieldsMeta(nextFields);
        const defaults = selected.alias === VERIFIED_SOURCE_ALIAS ? VERIFIED_FIELDS : pickDefaultFields(nextFields);
        setSelectedFields(defaults);
        setFilters(selected.alias === VERIFIED_SOURCE_ALIAS
          ? [{ field: 'reportName', operator: 'contains', value: 'Employee' }]
          : []);
      } catch (error) {
        if (!ignore) setMetadataError(error);
      } finally {
        if (!ignore) setLoadingFields(false);
      }
    }
    loadFields();
    return () => { ignore = true; };
  }, [source, sources]);

  const fieldOptions = useMemo(
    () => fieldsMeta.filter((f) => f.alias).map((f) => ({ value: f.alias, label: f.descriptor || f.alias, type: f.type })),
    [fieldsMeta],
  );

  const filterOptions = useMemo(
    () => fieldsMeta.filter(isFilterableField).map((f) => ({ value: f.alias, label: f.descriptor || f.alias, type: f.type })),
    [fieldsMeta],
  );

  const allFieldValues = useMemo(() => fieldOptions.map((f) => f.value), [fieldOptions]);

  const filteredSources = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) =>
      (s.descriptor || s.alias).toLowerCase().includes(q) || s.alias.toLowerCase().includes(q),
    );
  }, [sources, sourceSearch]);

  const selectedSourceLabel = useMemo(() => {
    const s = sources.find((s) => s.alias === source);
    return s ? (s.descriptor || s.alias) : '';
  }, [sources, source]);

  const TYPE_ORDER = ['Text', 'Numeric', 'Date', 'Boolean', 'Single instance', 'Multi-instance'];

  const fieldsByType = useMemo(() => {
    const groups = {};
    fieldOptions.forEach((f) => {
      const key = f.type || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    const ordered = {};
    TYPE_ORDER.forEach((t) => { if (groups[t]) ordered[t] = groups[t]; });
    Object.keys(groups).forEach((t) => { if (!ordered[t]) ordered[t] = groups[t]; });
    return ordered;
  }, [fieldOptions]);

  const buildQuery = () => {
    const fields = selectedFields.length
      ? selectedFields.join(', ')
      : allFieldValues.length
        ? allFieldValues.join(', ')
        : '*';

    let query = `SELECT ${fields} FROM ${source}`;

    const validFilters = filters.filter(
      (f) => filterOptions.some((opt) => opt.value === f.field) && f.field && f.operator && String(f.value).trim(),
    );

    if (validFilters.length) {
      query += ` WHERE ${validFilters.map((f) => `${f.field} ${f.operator} ${quoteValue(f.value, f.operator)}`).join(' AND ')}`;
    }

    return query;
  };

  const toggleField = (field) =>
    setSelectedFields((cur) => cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field]);

  const updateFilter = (index, key, value) => {
    setFilters((cur) =>
      cur.map((filter, i) => {
        if (i !== index) return filter;
        if (key !== 'field') return { ...filter, [key]: value };
        const operators = getOperatorsForField(value, filterOptions);
        return { ...filter, field: value, operator: operators[0] || '=' };
      }),
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onExecute(buildQuery());
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildQuery()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const query = buildQuery();
  const canRun = !isLoading && source && (selectedFields.length || allFieldValues.length);

  if (collapsed) {
    return (
      <div className="qb-strip">
        <button type="button" className="btn-strip-toggle" onClick={onExpand} title="Expand Query Builder">
          <PanelLeftOpen size={18} />
        </button>
      </div>
    );
  }

  return (
    <form className="qb-panel" onSubmit={handleSubmit}>
      {/* Header — sticky */}
      <div className="qb-header">
        <div className="qb-header-left">
          <Database size={18} className="qb-header-icon" />
          <h2 className="qb-title">Build Query</h2>
        </div>
        <button type="button" className="btn-collapse" onClick={onCollapse} title="Collapse panel">
          <PanelLeftClose size={17} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="qb-body">
        {metadataError && (
          <div className="meta-error">
            {JSON.stringify(metadataError.details || metadataError.error || metadataError)}
          </div>
        )}

        {/* ENTITY */}
        <div className="qb-section">
          <div className="qb-section-header">
            <span className="section-label">Entity</span>
            {sources.length > 0 && <span className="fields-count">{sources.length}</span>}
          </div>
          <div className="source-combobox" ref={sourceRef}>
            <div
              className={`source-input-wrap${sourceOpen ? ' open' : ''}`}
              onClick={() => { if (!loadingSources) { setSourceOpen((v) => !v); } }}
            >
              {sourceOpen ? (
                <input
                  className="source-search-input"
                  autoFocus
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  placeholder="Search entities…"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="source-selected-label">
                  {loadingSources ? 'Loading sources…' : (selectedSourceLabel || 'Select entity…')}
                </span>
              )}
              <ChevronDown size={14} className={`source-chevron${sourceOpen ? ' open' : ''}`} />
            </div>
            {sourceOpen && (
              <div className="source-dropdown">
                {filteredSources.length === 0 ? (
                  <div className="source-empty">No matches for "{sourceSearch}"</div>
                ) : (
                  filteredSources.map((s) => (
                    <div
                      key={s.id}
                      className={`source-option${s.alias === source ? ' selected' : ''}`}
                      onClick={() => { setSource(s.alias); setSourceOpen(false); setSourceSearch(''); }}
                    >
                      <span className="source-option-label">{s.descriptor || s.alias}</span>
                      <span className="source-option-alias">{s.alias}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* FILTERS */}
        <div className="qb-section">
          <div className="qb-section-header">
            <span className="section-label">Filters</span>
            {filters.length > 0 && (
              <button type="button" className="btn-clear" onClick={() => setFilters([])}>
                Clear all
              </button>
            )}
          </div>

          {filters.length === 0 && <p className="no-filters">No filters applied.</p>}

          <div className="filter-rows">
            {filters.map((filter, index) => (
              <div className="filter-row" key={index}>
                <select
                  className="select-field"
                  value={filter.field}
                  onChange={(e) => updateFilter(index, 'field', e.target.value)}
                >
                  <option value="">Field</option>
                  {filterOptions.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <select
                  className="select-field"
                  value={filter.operator}
                  onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                >
                  {getOperatorsForField(filter.field, filterOptions).map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                <input
                  className="input-field"
                  value={filter.value}
                  onChange={(e) => updateFilter(index, 'value', e.target.value)}
                  placeholder="Value"
                />
                <button
                  type="button"
                  className="btn-icon-sm"
                  onClick={() => setFilters((cur) => cur.filter((_, i) => i !== index))}
                  aria-label="Remove filter"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="add-filter-btn"
            onClick={() => setFilters((cur) => [...cur, { ...getDefaultFilter(filterOptions), value: '' }])}
          >
            <Plus size={14} />
            Add Filter
          </button>
        </div>

        {/* ADVANCED OPTIONS toggle */}
        <div
          className={`advanced-toggle ${advancedOpen ? 'open' : ''}`}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <span className="advanced-toggle-label">Advanced Options</span>
          <ChevronDown size={15} />
        </div>

        {advancedOpen && (
          <div className="advanced-body">
            <div className="fields-section">
              <div className="fields-sub-label">
                Select Fields
                {fieldOptions.length > 0 && (
                  <span className="fields-count">{selectedFields.length}/{fieldOptions.length}</span>
                )}
                {fieldOptions.length > 0 && (
                  <span className="fields-select-actions">
                    <button type="button" className="btn-field-action" onClick={() => setSelectedFields(allFieldValues)} disabled={selectedFields.length === allFieldValues.length}>All</button>
                    <span className="fields-action-sep">·</span>
                    <button type="button" className="btn-field-action" onClick={() => setSelectedFields([])} disabled={selectedFields.length === 0}>None</button>
                  </span>
                )}
              </div>
              {loadingFields ? (
                <p className="fields-loading">
                  <RefreshCw size={13} className="spin-icon" />
                  Loading fields…
                </p>
              ) : fieldOptions.length ? (
                <div className="fields-groups">
                  {Object.entries(fieldsByType).map(([type, fields]) => (
                    <div key={type} className="field-type-group">
                      <div className="field-type-header">
                        <span className={`type-badge type-${type.toLowerCase().replace(/\s+/g, '-')}`}>
                          {TYPE_ICONS[type] ?? '◈'} {type}
                        </span>
                        <span className="type-count">{fields.filter((f) => selectedFields.includes(f.value)).length}/{fields.length}</span>
                      </div>
                      <div className="fields-grid">
                        {fields.map((f) => (
                          <label key={f.value} className="field-check-item">
                            <input
                              type="checkbox"
                              checked={selectedFields.includes(f.value)}
                              onChange={() => toggleField(f.value)}
                            />
                            <span className="field-check-label" title={f.label}>{f.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="fields-loading">No fields available.</p>
              )}
            </div>
          </div>
        )}

        {/* WQL PREVIEW — standalone collapsible */}
        <div
          className={`wql-toggle ${wqlOpen ? 'open' : ''}`}
          onClick={() => setWqlOpen((v) => !v)}
        >
          <span className="advanced-toggle-label">WQL Preview</span>
          <ChevronDown size={15} />
        </div>
        {wqlOpen && (
          <div className="wql-section">
            <div className="wql-block">
              <pre className="wql-code">{query}</pre>
              <button type="button" className="btn-copy" onClick={handleCopy} aria-label="Copy query">
                <Copy size={13} />
                {copied ? ' Copied' : ''}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer — sticky */}
      <div className="qb-footer">
        <button type="submit" className="btn-run" disabled={!canRun}>
          {isLoading ? <span className="spinner" /> : <Play size={15} />}
          Run Query
        </button>
      </div>
    </form>
  );
}
