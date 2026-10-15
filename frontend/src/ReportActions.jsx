import React, { useState } from 'react';
import { downloadReport, printReport } from './report.js';

const fallbackText = (value, values = {}) => String(value).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => (
  Object.hasOwn(values, key) && values[key] != null ? String(values[key]) : match
));

export default function ReportActions({ record, compact = false, t = fallbackText }) {
  const [feedback, setFeedback] = useState(null);

  // Reports are available only for saved results, never for unsaved form values.
  if (!record?.scan || !record?.result) return null;

  function exportReport(format) {
    try {
      if (format === 'print') {
        // Keep window.open synchronous with this click for popup permissions.
        printReport(record);
        setFeedback({ text: 'Report opened in a new tab. Click Print / Save PDF there, then select Save as PDF.' });
      } else {
        downloadReport(record);
        setFeedback({ text: 'HTML download started. Open the file from your browser downloads to view or print it.' });
      }
    } catch (error) {
      setFeedback({ error: true, text: error.message || 'The report could not be exported. Please try again.' });
    }
  }

  return (
    <div className={`report-actions${compact ? ' report-actions-compact' : ''}`}>
      <div className="report-buttons">
        <button
          type="button"
          className="secondary-button"
          aria-label={t('Download HTML report for batch {batchId}', { batchId: record.scan.batch_id })}
          onClick={() => exportReport('download')}
        >
          {t('Download report (.html)')}
        </button>
        <button
          type="button"
          className="text-button"
          aria-label={t('Print or save PDF report for batch {batchId} (opens a new tab)', { batchId: record.scan.batch_id })}
          onClick={() => exportReport('print')}
        >
          {t('Print / Save PDF ↗')}
        </button>
      </div>
      {!compact && <p className="report-hint">{t('Export this saved scan. PDF saving uses your browser’s print dialog.')}</p>}
      {feedback && (
        <p className={`report-feedback${feedback.error ? ' report-feedback-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>
          {t(feedback.text)}
        </p>
      )}
    </div>
  );
}
