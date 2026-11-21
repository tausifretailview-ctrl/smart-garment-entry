/**
 * A Field Sales app address: /:org/salesman/... or the app's start link (?app=fieldsales).
 * Someone logged out on one of these goes to the Field Sales login (/:org/field-sales), not the
 * shop's owner / staff login. Exact segment: /:org/salesman-commission is an owner page.
 */
export function isFieldSalesLoggedOutPath(pathname: string, search: string): boolean {
  if (/^\/[^/]+\/salesman(\/|$)/.test(pathname)) return true;
  return new URLSearchParams(search).get("app") === "fieldsales";
}
