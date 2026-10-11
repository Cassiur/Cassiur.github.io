(function () {
  'use strict';
  // Fluid's desktop sidebar is hidden on phones; provide native collapsible navigation.
  function init() {
    var body = document.querySelector('.post-content .markdown-body');
    if (!body || document.querySelector('.mobile-toc')) return;
    var headings = body.querySelectorAll('h2[id], h3[id]');
    if (headings.length < 3) return;
    var details = document.createElement('details');
    details.className = 'mobile-toc';
    var summary = document.createElement('summary');
    summary.textContent = '文章目录';
    var nav = document.createElement('nav');
    nav.setAttribute('aria-label', '文章目录');
    headings.forEach(function (heading) {
      var link = document.createElement('a');
      link.href = '#' + encodeURIComponent(heading.id);
      link.textContent = heading.textContent;
      link.dataset.level = heading.tagName.slice(1);
      link.addEventListener('click', function () { details.open = false; });
      nav.appendChild(link);
    });
    details.appendChild(summary);
    details.appendChild(nav);
    body.parentNode.insertBefore(details, body);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('pjax:complete', init);
})();
