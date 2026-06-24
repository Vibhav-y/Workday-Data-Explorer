import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, LayoutList } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isComplex = (v) => Array.isArray(v) || isObject(v);

function getRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.value)) return payload.value;
  return [];
}

function getColumns(rows) {
  const seen = new Set();
  rows.slice(0, 25).forEach((row) => {
    Object.keys(row || {}).forEach((k) => { if (k !== 'WID') seen.add(k); });
  });
  return [...seen];
}

function formatValueForCSV(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (value.descriptor) return value.descriptor;
    if (Array.isArray(value)) return `[${value.length} items]`;
    return JSON.stringify(value);
  }
  return String(value);
}

function formatValue(value) {
  if (value === null || value === undefined) return <span className="empty-value">—</span>;
  if (typeof value === 'boolean') return <span className={value ? 'true-value' : 'false-value'}>{String(value)}</span>;
  if (typeof value !== 'object') {
    const str = String(value);
    const lower = str.toLowerCase();
    if (lower === 'active') return <span className="status-badge status-active">{str}</span>;
    if (lower === 'on leave' || lower === 'on_leave') return <span className="status-badge status-leave">{str}</span>;
    if (lower === 'inactive' || lower === 'terminated') return <span className="status-badge status-inactive">{str}</span>;
    return str;
  }
  if (value.descriptor) return <span className="descriptor-value">{value.descriptor}</span>;
  if (Array.isArray(value)) return <span className="complex-pill">{value.length} items</span>;
  return <span className="complex-pill">object</span>;
}

function exportToCSV(rows, columns) {
  if (!rows.length) { alert('No data to export'); return; }
  const header = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
  const body = rows.map((row) =>
    columns.map((col) => `"${formatValueForCSV(row[col]).replace(/"/g, '""')}"`).join(','),
  );
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workday-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportToPDF(rows, columns) {
  if (!rows.length) { alert('No data to export'); return; }
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const ts = new Date().toLocaleString();
    doc.setFontSize(16);
    doc.text('Workday Data Export', 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${ts}`, 14, 32);
    doc.text(`Total Records: ${rows.length}`, 14, 38);
    autoTable(doc, {
      head: [columns],
      body: rows.map((row) => columns.map((col) => formatValueForCSV(row[col]))),
      startY: 46,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 9, textColor: [16, 42, 67] },
      alternateRowStyles: { fillColor: [239, 244, 255] },
      margin: { top: 46, right: 14, bottom: 14, left: 14 },
      didDrawPage: (data) => {
        const { getHeight, getWidth } = doc.internal.pageSize;
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Page ${data.pageNumber}`, getWidth() / 2, getHeight() - 10, { align: 'center' });
      },
    });
    doc.save(`workday-export-${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (err) {
    console.error('PDF error:', err);
    alert('Failed to generate PDF');
  }
}

function formatColHeader(key) {
  return key
    .replace(/^cf_/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function getErrorMessage(error) {
  const msg = error?.details?.errors?.[0]?.error || error?.details?.error || error?.error;
  if (!msg) return 'Workday could not run this query.';
  if (/operator/i.test(msg)) return 'This field does not support the selected filter operator. Choose a text field like Report Name with "contains".';
  if (/valid report field|invalid select/i.test(msg)) return 'One selected field is not available for this data source. Remove it and run again.';
  if (/data source filter|prompt/i.test(msg)) return 'This data source requires an extra filter/prompt. Choose another entity or add the required filter.';
  return msg;
}

// Returns true if every item in an array is a leaf value or a simple descriptor object
function isSimpleArray(arr) {
  return arr.every((item) => !isComplex(item) || (isObject(item) && item.descriptor));
}

function NestedViewer({ data, depth = 0 }) {
  if (data === null || data === undefined) return <span className="empty-value">—</span>;

  // Primitive
  if (!isComplex(data)) return <span>{formatValue(data)}</span>;

  // Descriptor-only object → treat as a single value
  if (isObject(data) && data.descriptor) {
    return <span className="descriptor-value">{data.descriptor}</span>;
  }

  // Array
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="empty-value">Empty</span>;

    // Flat array of scalars / descriptor objects → chips
    if (isSimpleArray(data)) {
      return (
        <div className="nested-chips">
          {data.map((item, i) => (
            <span key={i} className="nested-chip">
              {isObject(item) ? item.descriptor : String(item)}
            </span>
          ))}
        </div>
      );
    }

    // Complex array → numbered rows
    return (
      <div className="nested-array-list">
        {data.map((item, i) => (
          <div className="nested-array-item" key={i}>
            <span className="nested-array-num">{i + 1}</span>
            <div className="nested-array-content">
              <NestedViewer data={item} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Object → key-value rows
  const entries = Object.entries(data).filter(([k]) => k !== 'WID');
  if (entries.length === 0) return <span className="empty-value">—</span>;

  return (
    <div className="nested-kv">
      {entries.map(([k, v]) => (
        <div className="nested-row" key={k}>
          <span className="nested-key">{k}</span>
          <span className="nested-val">
            {depth < 2 ? <NestedViewer data={v} depth={depth + 1} /> : formatValue(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TableRow({ row, columns }) {
  const [expanded, setExpanded] = useState(false);

  const hasNested = columns.some((col) => { const v = row[col]; return isComplex(v) && !v?.descriptor; });

  return (
    <>
      <tr className={expanded ? 'expanded-row' : ''}>
        <td className="expand-cell">
          {hasNested && (
            <button
              type="button"
              className={`btn-expand-row${expanded ? ' open' : ''}`}
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Collapse row' : 'Expand row'}
            >
              <ChevronRight size={14} />
            </button>
          )}
        </td>
        {columns.map((col) => {
          const v = row[col];
          const text = formatValueForCSV(v);
          return (
            <td key={col} title={text}>
              {formatValue(v)}
            </td>
          );
        })}
      </tr>
      {expanded && hasNested && (
        <tr className="nested-row-tr">
          <td className="nested-expand-spacer" />
          {columns.map((col) => {
            const val = row[col];
            const isNested = isComplex(val) && !val?.descriptor;
            if (!isNested) return <td key={col} className="nested-td-empty" />;
            return (
              <td key={col} className="nested-td">
                <span className="nested-td-label">{formatColHeader(col)}</span>
                <NestedViewer data={val} />
              </td>
            );
          })}
        </tr>
      )}
    </>
  );
}

export default function DataViewer({ data, error }) {
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  const rows = useMemo(() => getRows(data), [data]);
  const columns = useMemo(() => getColumns(rows), [rows]);
  const total = data?.total ?? rows.length;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => {
        const v = row[col];
        return String(v).toLowerCase().includes(q) || formatValueForCSV(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, search]);

  if (error) {
    return (
      <div className="error-panel fade-in">
        <h3>Query needs a small change</h3>
        <p>{getErrorMessage(error)}</p>
        <details>
          <summary>Technical detail</summary>
          <pre>{JSON.stringify(error.details || error, null, 2)}</pre>
        </details>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-panel fade-in">
        <LayoutList size={44} />
        <p>Run a query to see results here.</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="result-panel fade-in">
        <div className="result-top">
          <div className="result-title-area">
            <h3 className="result-title"><LayoutList size={18} />Query Results</h3>
            <span className="record-badge">0 records</span>
          </div>
        </div>
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13.5px' }}>
          No rows returned.
        </div>
      </div>
    );
  }

  return (
    <div className="result-panel fade-in">
      <div className="result-top">
        <div className="result-title-area">
          <h3 className="result-title">
            <LayoutList size={18} />
            Query Results
          </h3>
          <span className="record-badge">{total} records</span>
        </div>

        <div className="result-actions">
          <input
            type="text"
            className="search-input"
            placeholder="Search results…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search results"
          />

          <div className="export-wrapper" ref={exportRef}>
            <button
              type="button"
              className="btn-export"
              onClick={() => setExportOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={exportOpen}
            >
              <Download size={15} />
              Export
              <ChevronDown size={13} />
            </button>

            {exportOpen && (
              <div className="export-dropdown" role="menu">
                <button
                  type="button"
                  className="export-option"
                  role="menuitem"
                  onClick={() => { exportToCSV(filteredRows, columns); setExportOpen(false); }}
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  type="button"
                  className="export-option"
                  role="menuitem"
                  onClick={() => { exportToPDF(filteredRows, columns); setExportOpen(false); }}
                >
                  <Download size={14} />
                  Export PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {search && (
        <div className="search-info">
          Showing {filteredRows.length} of {rows.length} rows matching &ldquo;{search}&rdquo;
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="expand-cell" />
              {columns.map((col) => (
                <th key={col} title={col}>{formatColHeader(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length > 0 ? (
              filteredRows.map((row, i) => (
                <TableRow key={row.id || row.workdayID || i} row={row} columns={columns} />
              ))
            ) : (
              <tr className="no-results-row">
                <td colSpan={columns.length + 1}>No results match &ldquo;{search}&rdquo;</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
