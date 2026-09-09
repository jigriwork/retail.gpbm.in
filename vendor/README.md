# Spreadsheet engine provenance

`xlsx-0.20.3.tgz` is the unmodified official SheetJS Community Edition distribution:
https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`

License: Apache-2.0; LICENSE is included in the archive. The package lock also pins the archive integrity. Installation uses this local archive and does not need the CDN.

The npm registry's `xlsx@0.18.5` is obsolete. Official installation guidance uses the CDN distribution: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

0.20.3 includes the fixes for prototype pollution (fixed in 0.19.3) and the parser ReDoS issue (fixed in 0.20.2). The app additionally isolates parsing in a credential-free, time-limited process and validates workbook structure and resource limits. See `docs/p1-payroll-spreadsheet-safety.md`.

Do not replace this archive using `npm update xlsx`. A future update requires official provenance/integrity review, hostile-fixture tests and full genuine-workbook reconciliation. An empty npm audit is not proof that a vendored parser is free of vulnerabilities.
