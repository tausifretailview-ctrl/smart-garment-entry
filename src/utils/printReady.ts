/**
 * Wait for a print container to be fully rendered (data loaded, DOM painted, images loaded)
 * before invoking the print callback.
 * 
 * Polls for the `data-invoice-loading` attribute to disappear, ensures meaningful content,
 * then waits for all <img> elements to load.
 */
export const waitForPrintReady = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  onReady: () => void,
  options?: { maxWait?: number }
): void => {
  const MAX_WAIT = options?.maxWait ?? 8000;
  const startedAt = Date.now();

  const poll = () => {
    const el = containerRef.current;
    const text = (el?.textContent || '').trim();
    const hasLoadingAttr = el?.querySelector('[data-invoice-loading]') !== null;
    const isReady =
      el &&
      el.childElementCount > 0 &&
      !hasLoadingAttr &&
      text.length > 32 &&
      !/^loading\.?\.?\.?$/i.test(text);

    if (isReady) {
      // Wait for all images to load
      const images = Array.from(el.querySelectorAll('img'));
      const imagePromises = images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Don't block on failed images
        });
      });

      Promise.all(imagePromises).then(() => {
        // Double rAF to ensure paint
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            onReady();
          });
        });
      });
    } else if (Date.now() - startedAt < MAX_WAIT) {
      setTimeout(poll, 150);
    } else {
      // Timeout - print anyway with whatever we have
      console.warn('Print ready timeout - printing with current state');
      onReady();
    }
  };

  // Start polling after a tick to let React render
  setTimeout(poll, 50);
};
