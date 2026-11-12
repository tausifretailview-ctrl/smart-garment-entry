/** Employees whose name contains the search text (case-insensitive), for the POS Salesperson picker. */
export function filterPosSalesmen<T extends { employee_name: string }>(employees: T[], search: string): T[] {
  const q = search.toLowerCase();
  return employees.filter((emp) => emp.employee_name.toLowerCase().includes(q));
}
