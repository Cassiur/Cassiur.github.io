(function () {
  'use strict';
  var library;
  var diagrams = [];
  var sequence = 0;
  var rendering = false;
  var pending = false;
  function load() {
    if (!library) library = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/js/vendor/mermaid-10.9.8.min.js';
      script.onload = function () { resolve(window.mermaid); };
      script.onerror = function () { library = null; reject(new Error('图表组件加载失败')); };
      document.head.appendChild(script);
    });
    return library;
  }
  function dark() {
    var mode = document.documentElement.getAttribute('data-user-color-scheme');
    return mode === 'dark' || (!mode && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function collect() {
    diagrams = diagrams.filter(function (item) { return item.figure.isConnected; });
    document.querySelectorAll('.markdown-body pre > code.mermaid').forEach(function (code) {
      var figure = document.createElement('figure');
      figure.className = 'blog-diagram';
      var canvas = document.createElement('div');
      canvas.className = 'mermaid-diagram';
      canvas.setAttribute('tabindex', '0');
      canvas.setAttribute('aria-label', '图表，可横向滚动查看');
      figure.appendChild(canvas);
      var source = code.textContent;
      code.parentNode.replaceWith(figure);
      var item = {figure: figure, canvas: canvas, source: source, fit: false};
      var caption = document.createElement('figcaption');
      var hint = document.createElement('span');
      hint.textContent = '左右滑动阅读';
      var zoom = document.createElement('button');
      zoom.type = 'button';
      zoom.textContent = '查看全图';
      zoom.addEventListener('click', function () {
        item.fit = !item.fit;
        var svg = canvas.querySelector('svg');
        if (svg) svg.style.width = item.fit ? '100%' : Math.ceil(svg.viewBox.baseVal.width) + 'px';
        zoom.textContent = item.fit ? '放大阅读' : '查看全图';
        hint.textContent = item.fit ? '完整图表' : '左右滑动阅读';
      });
      caption.appendChild(hint);
      caption.appendChild(zoom);
      figure.appendChild(caption);
      diagrams.push(item);
    });
    if (diagrams.length) render();
  }
  async function render() {
    if (rendering) { pending = true; return; }
    rendering = true;
    try {
      var mermaid = await load();
      mermaid.initialize({startOnLoad: false, theme: dark() ? 'dark' : 'default', securityLevel: 'strict',
        fontFamily: 'Arial, "Microsoft YaHei", sans-serif', suppressErrorRendering: true});
      for (var item of diagrams) {
        if (!item.figure.isConnected) continue;
        try {
          var result = await mermaid.render('blog-diagram-' + (++sequence), item.source);
          item.canvas.innerHTML = result.svg;
          var svg = item.canvas.querySelector('svg');
          if (svg) {
            // Preserve readable labels on phones; the container scrolls instead of shrinking the whole graph.
            var box = svg.viewBox.baseVal;
            if (box && box.width) svg.style.width = item.fit ? '100%' : Math.ceil(box.width) + 'px';
            svg.style.maxWidth = 'none';
            svg.style.height = 'auto';
          }
          if (result.bindFunctions) result.bindFunctions(item.canvas);
          if (!item.figure.dataset.rendered && /^mindmap\s/.test(item.source.trim())) {
            item.canvas.scrollLeft = Math.max(0, (item.canvas.scrollWidth - item.canvas.clientWidth) / 2);
          }
          item.figure.dataset.rendered = 'true';
        } catch (error) {
          item.figure.dataset.rendered = 'error';
          var fallback = document.createElement('details');
          var summary = document.createElement('summary');
          summary.textContent = '图表暂时无法显示，展开查看原文';
          var code = document.createElement('pre');
          code.textContent = item.source;
          fallback.appendChild(summary);
          fallback.appendChild(code);
          item.canvas.replaceChildren(fallback);
          console.error('Mermaid diagram:', error);
        }
      }
    } catch (error) {
      diagrams.forEach(function (item) {
        item.figure.dataset.rendered = 'error';
        item.canvas.textContent = '图表组件加载失败，请刷新重试。';
      });
      console.error(error);
    } finally {
      rendering = false;
      if (pending) { pending = false; render(); }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', collect);
  else collect();
  document.addEventListener('pjax:complete', collect);
  new MutationObserver(function () { if (diagrams.length) render(); })
    .observe(document.documentElement, {attributes: true, attributeFilter: ['data-user-color-scheme']});
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  if (media.addEventListener) media.addEventListener('change', function () { if (diagrams.length) render(); });
})();
