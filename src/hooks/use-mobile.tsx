import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1180; // iPad Pro 12.9" landscape

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(false);

  React.useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const isIPad =
        /iPad/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document);
      setIsTablet(isIPad || (w >= MOBILE_BREAKPOINT && w < TABLET_BREAKPOINT));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isTablet;
}

export function useIsIPad() {
  const [isIPad, setIsIPad] = React.useState(false);

  React.useEffect(() => {
    setIsIPad(
      /iPad/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document)
    );
  }, []);

  return isIPad;
}
