/*
 * Masonry layout + infinite scroll for the post card grid (_default/list.html).
 *
 * Progressive enhancement: without this script the grid is a plain CSS grid
 * and Hugo's numbered pagination is shown as usual.
 *
 * Masonry: in .is-masonry mode the grid has tiny implicit rows (grid-auto-rows
 * in main.scss). Each card spans as many rows as its height needs, and CSS
 * grid auto-placement drops it into the shortest column. DOM order, and so
 * keyboard/reading order, stays newest-first.
 *
 * Infinite scroll: as the end of the grid nears the viewport, fetch the next
 * pagination page (data-next), take its cards and append them here.
 */
(() => {
  const grid = document.querySelector('[data-post-grid]');
  if (!grid || !('ResizeObserver' in window)) return;

  // ---- Masonry -------------------------------------------------------------

  const columnCount = () =>
    getComputedStyle(grid).gridTemplateColumns.split(' ').length;

  const sizeCards = (cards) => {
    const style = getComputedStyle(grid);
    const rowHeight = parseFloat(style.gridAutoRows);
    const gap = parseFloat(style.columnGap) || 0; // row-gap is 0 in masonry mode; the span adds it back
    for (const card of cards) {
      const rows = Math.ceil((card.getBoundingClientRect().height + gap) / rowHeight);
      card.style.gridRowEnd = `span ${rows}`;
    }
  };

  let columns = 0;
  const layout = () => {
    const count = columnCount();
    if (count === columns) return;
    columns = count;
    const masonry = count > 1; // a single column needs no packing
    grid.classList.toggle('is-masonry', masonry);
    for (const card of grid.children) card.style.gridRowEnd = '';
    if (masonry) sizeCards(grid.children);
  };

  // Card heights change with column width, late-loading images, fonts, etc.
  const resizeObserver = new ResizeObserver((entries) => {
    if (grid.classList.contains('is-masonry')) sizeCards(entries.map((entry) => entry.target));
  });

  layout();
  for (const card of grid.children) resizeObserver.observe(card);
  window.addEventListener('resize', layout); // only re-lays out when the column count changes

  // ---- Infinite scroll -----------------------------------------------------

  let nextUrl = grid.dataset.next;
  if (!nextUrl || !('IntersectionObserver' in window)) return;

  const pager = document.querySelector('[data-post-pager]');
  if (pager) pager.hidden = true;

  // Doubles as the scroll sentinel and a polite live region for status text.
  const status = document.createElement('div');
  status.className = 'post-grid-status text-muted';
  status.setAttribute('role', 'status');
  grid.after(status);

  let loading = false;

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadNext();
  }, { rootMargin: '0px 0px 600px 0px' }); // start fetching a bit before the bottom

  const showRetry = () => {
    observer.disconnect(); // don't hammer a failing URL on every scroll
    status.textContent = 'Couldn’t load more posts. ';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-link p-0 align-baseline';
    button.textContent = 'Try again';
    button.addEventListener('click', () => {
      observer.observe(status);
      loadNext();
    });
    status.append(button);
  };

  async function loadNext() {
    if (loading || !nextUrl) return;
    loading = true;
    grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading more posts…';

    try {
      const response = await fetch(nextUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${nextUrl}`);
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextGrid = page.querySelector('[data-post-grid]');
      if (!nextGrid) throw new Error(`No post grid in ${nextUrl}`);

      const cards = [...nextGrid.children];
      grid.append(...cards);
      if (grid.classList.contains('is-masonry')) sizeCards(cards);
      for (const card of cards) resizeObserver.observe(card);

      nextUrl = nextGrid.dataset.next;
      status.textContent = '';
    } catch (error) {
      console.error('Could not load more posts:', error);
      showRetry();
      return;
    } finally {
      loading = false;
      grid.removeAttribute('aria-busy');
    }

    if (!nextUrl) {
      observer.disconnect();
      status.remove();
      return;
    }
    // On tall screens the sentinel can still be in view after appending, and
    // IntersectionObserver only reports changes. Re-observing forces a fresh check.
    observer.unobserve(status);
    observer.observe(status);
  }

  observer.observe(status);
})();
