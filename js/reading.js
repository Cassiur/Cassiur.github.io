(function () {
  'use strict';
  var cleanup = function () {};
  function init() {
    cleanup();
    var content = document.querySelector('.post-content .markdown-body, .page-content');
    if (!content && document.querySelector('link[href="/css/manual-mobile.css"]')) content = document.body;
    if (!content) return;
    var headings = Array.prototype.slice.call(content.querySelectorAll('h2, h3'));
    if (headings.length < 3) return;
    headings.forEach(function (heading, index) { if (!heading.id) heading.id = 'reading-section-' + index; });
    var key = 'blog-reading:v1:' + location.pathname;
    var previous = null;
    try { previous = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    if (!previous || typeof previous.ratio !== 'number' || typeof previous.offset !== 'number') previous = null;
    var canResume = !!(previous && previous.ratio > .01);
    var nodes = [];
    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    }
    function button(text, action) {
      var node = el('button', '', text);
      node.type = 'button';
      node.addEventListener('click', action);
      return node;
    }
    function insert(node) {
      if (content === document.body) content.insertBefore(node, content.firstChild);
      else content.parentNode.insertBefore(node, content);
      nodes.push(node);
    }
    var details = el('details', 'mobile-toc');
    details.appendChild(el('summary', '', '文章目录'));
    var inlineNav = el('nav');
    inlineNav.setAttribute('aria-label', '文章目录');
    details.appendChild(inlineNav);
    insert(details);
    var dialog = el('dialog', 'reading-directory');
    dialog.setAttribute('aria-labelledby', 'reading-directory-title');
    var head = el('div', 'reading-directory-head');
    var title = el('strong', '', '文章目录');
    title.id = 'reading-directory-title';
    head.appendChild(title);
    head.appendChild(button('关闭', closeDirectory));
    dialog.appendChild(head);
    var nav = el('nav');
    nav.setAttribute('aria-label', '跳转到章节');
    dialog.appendChild(nav);
    document.body.appendChild(dialog);
    nodes.push(dialog);
    var toolbar = el('div', 'reading-toolbar');
    toolbar.setAttribute('role', 'navigation');
    toolbar.setAttribute('aria-label', '阅读工具');
    var tocButton = button('目录', function () {
      var active = currentHeading();
      nav.querySelectorAll('a').forEach(function (link) {
        if (active && link.hash === '#' + encodeURIComponent(active.id)) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
      var activeLink = nav.querySelector('[aria-current]');
      if (activeLink) activeLink.scrollIntoView({block: 'center'});
    });
    var resumeButton = button('', resume);
    toolbar.appendChild(tocButton);
    toolbar.appendChild(resumeButton);
    toolbar.appendChild(button('顶部', function () { window.scrollTo({top: 0, behavior: 'auto'}); }));
    document.body.appendChild(toolbar);
    document.body.classList.add('has-reading-tools');
    nodes.push(toolbar);
    var reminder = null;
    if (canResume) {
      reminder = el('div', 'reading-reminder');
      reminder.appendChild(el('span', '', '上次读到 ' + (previous.title || '正文') + '（' + Math.round(previous.ratio * 100) + '%）'));
      reminder.appendChild(button('继续阅读', resume));
      insert(reminder);
    }
    function closeDirectory() {
      if (dialog.close) dialog.close();
      else dialog.removeAttribute('open');
      tocButton.focus({preventScroll: true});
    }
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) {
        var rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDirectory();
      }
    });
    headings.forEach(function (heading) {
      [inlineNav, nav].forEach(function (target) {
        var link = el('a', '', heading.textContent.trim());
        link.href = '#' + encodeURIComponent(heading.id);
        link.dataset.level = heading.tagName.slice(1);
        link.addEventListener('click', function (event) {
          event.preventDefault();
          details.open = false;
          if (dialog.hasAttribute('open')) closeDirectory();
          dismissReminder();
          history.replaceState(null, '', '#' + encodeURIComponent(heading.id));
          window.scrollTo({top: heading.getBoundingClientRect().top + window.scrollY - 90, behavior: 'auto'});
          save();
        });
        target.appendChild(link);
      });
    });
    function currentHeading() {
      var active = null;
      headings.some(function (heading) {
        if (heading.getBoundingClientRect().top > 100) return true;
        active = heading;
        return false;
      });
      return active;
    }
    function bounds() {
      var rect = content.getBoundingClientRect();
      return {top: rect.top + window.scrollY, length: Math.max(1, rect.height - window.innerHeight + 90)};
    }
    function ratio() {
      var area = bounds();
      return Math.max(0, Math.min(1, (window.scrollY + 90 - area.top) / area.length));
    }
    function dismissReminder() {
      canResume = false;
      if (reminder) reminder.remove();
      update();
    }
    function resume() {
      if (!canResume) return;
      // Removing the reminder changes document height, so measure afterwards.
      dismissReminder();
      var target = document.getElementById(previous.id);
      var area = bounds();
      var top = target && content.contains(target) ? target.getBoundingClientRect().top + window.scrollY + previous.offset - 90 : area.top + area.length * previous.ratio - 90;
      window.scrollTo({top: Math.max(0, top), behavior: 'auto'});
      save();
    }
    function update() {
      resumeButton.textContent = canResume ? '继续上次 ' + Math.round(previous.ratio * 100) + '%' : '已读 ' + Math.round(ratio() * 100) + '%';
      resumeButton.disabled = !canResume;
      resumeButton.title = canResume ? previous.title || '回到上次阅读位置' : '阅读位置自动保存在此浏览器';
    }
    function save() {
      var progress = ratio();
      // Opening at the banner must not erase a useful saved position.
      if (progress <= .01) return;
      var heading = currentHeading();
      var area = bounds();
      try {
        localStorage.setItem(key, JSON.stringify({id: heading ? heading.id : '', title: heading ? heading.textContent.trim() : '正文',
          offset: heading ? 90 - heading.getBoundingClientRect().top : window.scrollY + 90 - area.top,
          ratio: progress, updatedAt: Date.now()}));
      } catch (e) {}
    }
    var timer;
    function onScroll() { update(); clearTimeout(timer); timer = setTimeout(save, 300); }
    function onHide() { if (document.visibilityState === 'hidden') save(); }
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('pagehide', save);
    window.addEventListener('resize', update);
    document.addEventListener('visibilitychange', onHide);
    update();
    cleanup = function () {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('resize', update);
      document.removeEventListener('visibilitychange', onHide);
      nodes.forEach(function (node) { node.remove(); });
      document.body.classList.remove('has-reading-tools');
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('pjax:complete', init);
})();
