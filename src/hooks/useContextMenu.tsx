import { useState, useCallback, useEffect, useRef } from "react";

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface UseContextMenuReturn<T = any> {
  isOpen: boolean;
  position: ContextMenuPosition;
  contextData: T | null;
  openMenu: (event: React.MouseEvent, data: T) => void;
  closeMenu: () => void;
}

/**
 * Hook for managing context menu state
 * Provides position tracking, data storage, and auto-close on Esc
 * Only works on desktop (non-touch devices)
 */
export function useContextMenu<T = any>(): UseContextMenuReturn<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<ContextMenuPosition>({ x: 0, y: 0 });
  const [contextData, setContextData] = useState<T | null>(null);
  
  const openMenu = useCallback((event: React.MouseEvent, data: T) => {
    // Disable on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    // Calculate position ensuring menu stays within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = 200; // Approximate menu width
    const menuHeight = 300; // Approximate max menu height
    
    let x = event.clientX;
    let y = event.clientY;
    
    // Adjust if menu would overflow right edge
    if (x + menuWidth > viewportWidth) {
      x = viewportWidth - menuWidth - 8;
    }
    
    // Adjust if menu would overflow bottom edge
    if (y + menuHeight > viewportHeight) {
      y = viewportHeight - menuHeight - 8;
    }
    
    setPosition({ x, y });
    setContextData(data);
    setIsOpen(true);
  }, []);
  
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setContextData(null);
  }, []);
  
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };
    
    const handleClickOutside = () => {
      closeMenu();
    };
    
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("contextmenu", handleClickOutside);
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("contextmenu", handleClickOutside);
    };
  }, [isOpen, closeMenu]);
  
  return {
    isOpen,
    position,
    contextData,
    openMenu,
    closeMenu,
  };
}

/**
 * Check if device is desktop (non-touch)
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);
  
  useEffect(() => {
    const checkDesktop = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isLargeScreen = window.innerWidth >= 1024;
      setIsDesktop(!isTouchDevice && isLargeScreen);
    };
    
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);
  
  return isDesktop;
}
