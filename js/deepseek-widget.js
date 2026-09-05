/*!
 * DeepSeek Inline Query Widget v1.0
 * 选中文字 → Ask DeepSeek → 流式回答
 * 作者：Claude (为 whyalwaysme.lol 定制)
 */
(function () {
  'use strict';

  // ─── 配置 ────────────────────────────────────────────────────────────────
  var STORAGE_KEY = 'ds_api_key';
  var API_URL     = 'https://api.deepseek.com/v1/chat/completions';
  var MODEL       = 'deepseek-chat';
  // 系统提示全程静态，利用 DeepSeek prompt cache（缓存命中价格 ¥0.02/M）
  var SYS_PROMPT  =
    '你是一个技术学习助手，专注于 Java 后端、Spring 生态、JVM、系统设计、' +
    'Redis、Kafka、Elasticsearch、RabbitMQ、Docker、Kubernetes 等领域。' +
    '用户会给你一段博客文章的摘录，并就此提问。请结合上下文给出简洁准确的回答，' +
    '回答用中文，专业术语可保留英文，代码块用 markdown 格式。';

  // ─── 工具函数 ─────────────────────────────────────────────────────────────
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function(k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html')  e.innerHTML = attrs[k];
      else if (k === 'text')  e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    if (children) children.forEach(function(c) { if (c) e.appendChild(c); });
    return e;
  }

  // ─── 状态 ─────────────────────────────────────────────────────────────────
  var state = {
    apiKey: '',
    selectedText: '',
    lastX: 0, lastY: 0,
    streaming: false,
    abortCtrl: null,
  };

  // ─── 载入 API Key ─────────────────────────────────────────────────────────
  try { state.apiKey = localStorage.getItem(STORAGE_KEY) || ''; } catch(e) {}

  // ─── 注入 CSS（同文件，减少 HTTP 请求）───────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    /* ── 通用 */
    '#ds-fab{position:fixed;bottom:28px;right:28px;z-index:9998;width:46px;height:46px;',
    'border-radius:50%;background:linear-gradient(135deg,#4f8ef7,#6c3be4);color:#fff;',
    'border:none;cursor:pointer;font-size:20px;box-shadow:0 4px 14px rgba(79,142,247,.5);',
    'transition:transform .2s,box-shadow .2s;display:flex;align-items:center;justify-content:center;}',
    '#ds-fab:hover{transform:scale(1.1);box-shadow:0 6px 20px rgba(79,142,247,.65);}',

    /* ── 气泡（选词触发） */
    '#ds-bubble{position:fixed;z-index:9999;background:#4f8ef7;color:#fff;',
    'padding:5px 12px;border-radius:20px;font-size:13px;cursor:pointer;',
    'box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap;',
    'transition:opacity .15s;user-select:none;}',
    '#ds-bubble:hover{background:#3a7aef;}',

    /* ── 遮罩 */
    '#ds-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;',
    'display:flex;align-items:center;justify-content:center;',
    'animation:ds-fade-in .15s ease;}',
    '@keyframes ds-fade-in{from{opacity:0}to{opacity:1}}',

    /* ── 对话框 */
    '#ds-modal{background:#fff;border-radius:14px;width:min(680px,92vw);max-height:80vh;',
    'display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;}',
    '[data-theme=dark] #ds-modal{background:#1e2130;color:#e2e8f0;}',
    '@media(prefers-color-scheme:dark){#ds-modal{background:#1e2130;color:#e2e8f0;}}',

    /* ── Modal header */
    '#ds-modal-head{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;',
    'border-bottom:1px solid #e5e7eb;flex-shrink:0;}',
    '[data-theme=dark] #ds-modal-head{border-color:#2d3148;}',
    '#ds-modal-head h3{margin:0;font-size:16px;font-weight:600;',
    'background:linear-gradient(135deg,#4f8ef7,#6c3be4);-webkit-background-clip:text;',
    '-webkit-text-fill-color:transparent;}',
    '#ds-close{background:none;border:none;cursor:pointer;font-size:20px;color:#9ca3af;',
    'line-height:1;padding:2px 6px;border-radius:6px;}',
    '#ds-close:hover{background:#f3f4f6;color:#374151;}',
    '[data-theme=dark] #ds-close:hover{background:#2d3148;color:#e2e8f0;}',

    /* ── 选中文字预览 */
    '#ds-ctx-wrap{padding:12px 20px;flex-shrink:0;}',
    '#ds-ctx{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;',
    'padding:10px 14px;font-size:13px;color:#64748b;max-height:90px;overflow-y:auto;',
    'line-height:1.6;font-style:italic;}',
    '[data-theme=dark] #ds-ctx{background:#161827;border-color:#2d3148;color:#94a3b8;}',

    /* ── 问题输入 */
    '#ds-q-wrap{padding:0 20px 12px;flex-shrink:0;}',
    '#ds-q{width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #d1d5db;',
    'border-radius:8px;font-size:14px;resize:none;font-family:inherit;',
    'transition:border-color .15s;height:68px;}',
    '#ds-q:focus{outline:none;border-color:#4f8ef7;}',
    '[data-theme=dark] #ds-q{background:#1e2130;color:#e2e8f0;border-color:#3d4466;}',
    '[data-theme=dark] #ds-q:focus{border-color:#4f8ef7;}',

    /* ── 按钮行 */
    '#ds-btn-row{padding:0 20px 14px;display:flex;gap:10px;flex-shrink:0;}',
    '#ds-submit{flex:1;padding:10px;border:none;border-radius:8px;cursor:pointer;',
    'background:linear-gradient(135deg,#4f8ef7,#6c3be4);color:#fff;font-size:14px;',
    'font-weight:600;transition:opacity .15s;}',
    '#ds-submit:hover:not(:disabled){opacity:.88;}',
    '#ds-submit:disabled{opacity:.5;cursor:not-allowed;}',
    '#ds-stop{padding:10px 18px;border:1.5px solid #e2e8f0;background:none;',
    'border-radius:8px;cursor:pointer;font-size:14px;color:#64748b;display:none;}',
    '[data-theme=dark] #ds-stop{border-color:#3d4466;color:#94a3b8;}',
    '#ds-stop:hover{background:#f3f4f6;}',

    /* ── 回答区 */
    '#ds-ans-wrap{flex:1;overflow-y:auto;padding:0 20px 18px;min-height:60px;}',
    '#ds-ans{font-size:14px;line-height:1.8;white-space:pre-wrap;word-break:break-word;}',
    '#ds-ans code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:13px;}',
    '[data-theme=dark] #ds-ans code{background:#2d3148;}',
    '.ds-cursor{display:inline-block;width:2px;height:1em;background:#4f8ef7;',
    'animation:ds-blink .7s step-end infinite;vertical-align:text-bottom;margin-left:1px;}',
    '@keyframes ds-blink{0%,100%{opacity:1}50%{opacity:0}}',
    '#ds-err{color:#ef4444;font-size:13px;padding:8px 0;}',

    /* ── 设置面板 */
    '#ds-settings{background:#fff;border-radius:14px;width:min(420px,90vw);',
    'padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3);}',
    '[data-theme=dark] #ds-settings{background:#1e2130;color:#e2e8f0;}',
    '#ds-settings h3{margin:0 0 16px;font-size:17px;font-weight:600;}',
    '#ds-settings label{display:block;font-size:13px;color:#64748b;margin-bottom:6px;}',
    '[data-theme=dark] #ds-settings label{color:#94a3b8;}',
    '#ds-key-input{width:100%;box-sizing:border-box;padding:9px 12px;',
    'border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;font-family:monospace;}',
    '#ds-key-input:focus{outline:none;border-color:#4f8ef7;}',
    '[data-theme=dark] #ds-key-input{background:#161827;color:#e2e8f0;border-color:#3d4466;}',
    '#ds-key-hint{font-size:12px;color:#94a3b8;margin:6px 0 18px;}',
    '#ds-key-hint a{color:#4f8ef7;}',
    '#ds-save-key{width:100%;padding:10px;border:none;border-radius:8px;cursor:pointer;',
    'background:linear-gradient(135deg,#4f8ef7,#6c3be4);color:#fff;font-weight:600;}',
    '#ds-save-key:hover{opacity:.88;}',
  ].join('');
  document.head.appendChild(style);

  // ─── 构建 DOM ─────────────────────────────────────────────────────────────

  // FAB 按钮
  var fab = el('button', {id:'ds-fab', title:'DeepSeek AI 助手', 'aria-label':'DeepSeek'});
  fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93V18c0-.55.45-1 1-1s1 .45 1 1v1.93C9.39 19.72 6.81 17.5 5.33 14.5H7c.55 0 1-.45 1-1s-.45-1-1-1H4.07C4.03 12.34 4 12.17 4 12s.03-.34.07-.5H7c.55 0 1-.45 1-1s-.45-1-1-1H5.33C6.81 6.5 9.39 4.28 12 4.07V6c0 .55.45 1 1 1s1-.45 1-1V4.07c2.61.21 5.19 2.43 6.67 5.43H19c-.55 0-1 .45-1 1s.45 1 1 1h2.93c.04.16.07.33.07.5s-.03.34-.07.5H19c-.55 0-1 .45-1 1s.45 1 1 1h1.67C18.19 17.5 15.61 19.72 13 19.93zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>';
  document.body.appendChild(fab);

  // 选词气泡
  var bubble = el('div', {id:'ds-bubble', text:'✨ 问 DeepSeek'});
  bubble.style.display = 'none';
  document.body.appendChild(bubble);

  // ─── 气泡逻辑 ─────────────────────────────────────────────────────────────
  var bubbleTimer = null;

  document.addEventListener('mouseup', function (e) {
    // 忽略 widget 内部的选择
    if (e.target.closest('#ds-overlay') || e.target.closest('#ds-fab') || e.target.closest('#ds-bubble')) return;

    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) { bubble.style.display = 'none'; return; }
      var text = sel.toString().trim();
      if (text.length < 10) { bubble.style.display = 'none'; return; }

      state.selectedText = text;
      var range = sel.getRangeAt(0);
      var rect  = range.getBoundingClientRect();
      var bx = Math.min(rect.left + rect.width / 2 - 60, window.innerWidth - 160);
      var by = rect.top + window.scrollY - 44;
      if (by < 8) by = rect.bottom + window.scrollY + 8;
      bubble.style.left = Math.max(8, bx) + 'px';
      bubble.style.top  = by + 'px';
      bubble.style.display = 'block';
    }, 120);
  });

  document.addEventListener('mousedown', function (e) {
    if (e.target !== bubble) {
      clearTimeout(bubbleTimer);
      bubble.style.display = 'none';
    }
  });

  bubble.addEventListener('click', function () {
    bubble.style.display = 'none';
    openQueryModal();
  });

  // ─── FAB 点击：没有 apiKey → 打开设置；有 → 打开查询（无上下文）──────────
  fab.addEventListener('click', function () {
    if (!state.apiKey) { openSettings(); }
    else { state.selectedText = ''; openQueryModal(); }
  });

  // ─── 设置面板 ─────────────────────────────────────────────────────────────
  function openSettings() {
    var overlay = el('div', {id:'ds-overlay'});
    var panel   = el('div', {id:'ds-settings'});
    panel.innerHTML =
      '<h3>🔑 DeepSeek API 设置</h3>' +
      '<label>API Key</label>' +
      '<input id="ds-key-input" type="password" placeholder="sk-xxxxxxxxxxxxxxxx" />' +
      '<p id="ds-key-hint">在 <a href="https://platform.deepseek.com/api_keys" target="_blank">platform.deepseek.com</a> 获取，仅存在本地浏览器。</p>' +
      '<button id="ds-save-key">保存并开始使用</button>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var input   = $('#ds-key-input', panel);
    var saveBtn = $('#ds-save-key', panel);
    if (state.apiKey) input.value = state.apiKey;
    input.focus();

    saveBtn.addEventListener('click', function () {
      var key = input.value.trim();
      if (!key.startsWith('sk-')) { input.style.borderColor = '#ef4444'; return; }
      state.apiKey = key;
      try { localStorage.setItem(STORAGE_KEY, key); } catch(e) {}
      overlay.remove();
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ─── 查询对话框 ───────────────────────────────────────────────────────────
  function openQueryModal() {
    if (!state.apiKey) { openSettings(); return; }

    var overlay = el('div', {id:'ds-overlay'});
    var modal   = el('div', {id:'ds-modal'});

    // Header
    var head = el('div', {id:'ds-modal-head'});
    head.innerHTML = '<h3>✨ DeepSeek AI 助手</h3>';
    var closeBtn = el('button', {id:'ds-close', title:'关闭'}, [document.createTextNode('×')]);
    head.appendChild(closeBtn);

    // Context preview
    var ctxWrap = '';
    if (state.selectedText) {
      ctxWrap = el('div', {id:'ds-ctx-wrap'});
      ctxWrap.appendChild(el('div', {id:'ds-ctx',
        text: state.selectedText.length > 400
          ? state.selectedText.slice(0, 400) + '…'
          : state.selectedText}));
    }

    // Question input
    var qWrap = el('div', {id:'ds-q-wrap'});
    var qInput = el('textarea', {id:'ds-q',
      placeholder: state.selectedText ? '针对上方选中内容提问…' : '有什么想问的？'});
    qWrap.appendChild(qInput);

    // Buttons
    var btnRow  = el('div', {id:'ds-btn-row'});
    var submit  = el('button', {id:'ds-submit', text:'发送'});
    var stop    = el('button', {id:'ds-stop',   text:'停止'});
    var settings= el('button', {id:'ds-settings-btn', text:'⚙ Key', title:'修改 API Key',
      style:'padding:10px 14px;border:1.5px solid #e2e8f0;background:none;border-radius:8px;cursor:pointer;font-size:13px;color:#94a3b8;'});
    btnRow.appendChild(submit);
    btnRow.appendChild(stop);
    btnRow.appendChild(settings);

    // Answer area
    var ansWrap = el('div', {id:'ds-ans-wrap'});
    var ansDiv  = el('div', {id:'ds-ans'});
    ansWrap.appendChild(ansDiv);

    modal.appendChild(head);
    if (ctxWrap) modal.appendChild(ctxWrap);
    modal.appendChild(qWrap);
    modal.appendChild(btnRow);
    modal.appendChild(ansWrap);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    qInput.focus();

    // ── 事件 ──────────────────────────────────────────────────────────────
    closeBtn.addEventListener('click', function () { abort(); overlay.remove(); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { abort(); overlay.remove(); }
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { abort(); overlay.remove(); document.removeEventListener('keydown', esc); }
    });

    stop.addEventListener('click', abort);

    settings.addEventListener('click', function () {
      overlay.remove();
      state.selectedText = '';
      openSettings();
    });

    submit.addEventListener('click', doQuery);
    qInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doQuery();
    });

    function abort() {
      if (state.abortCtrl) { state.abortCtrl.abort(); state.abortCtrl = null; }
      state.streaming = false;
      submit.disabled = false;
      stop.style.display = 'none';
      // Remove cursor
      var cur = ansDiv.querySelector('.ds-cursor');
      if (cur) cur.remove();
    }

    function doQuery() {
      var question = qInput.value.trim();
      if (!question || state.streaming) return;

      ansDiv.textContent = '';
      ansDiv.style.color = '';
      state.streaming = true;
      submit.disabled = true;
      stop.style.display = 'block';

      // Add blinking cursor
      var cursor = el('span', {'class': 'ds-cursor'});
      ansDiv.appendChild(cursor);

      var messages = [{ role: 'system', content: SYS_PROMPT }];
      if (state.selectedText) {
        messages.push({ role: 'user',
          content: '【博客摘录】\n' + state.selectedText + '\n\n【问题】\n' + question });
      } else {
        messages.push({ role: 'user', content: question });
      }

      state.abortCtrl = new AbortController();

      fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + state.apiKey
        },
        body: JSON.stringify({
          model: MODEL,
          messages: messages,
          stream: true,
          max_tokens: 2048,
          temperature: 0.3
        }),
        signal: state.abortCtrl.signal
      })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error((err.error && err.error.message) || ('HTTP ' + res.status));
          });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) { finish(); return; }
            buf += decoder.decode(result.value, { stream: true });
            var lines = buf.split('\n');
            buf = lines.pop();
            lines.forEach(function (line) {
              line = line.trim();
              if (!line || line === 'data: [DONE]') return;
              if (line.startsWith('data: ')) {
                try {
                  var obj  = JSON.parse(line.slice(6));
                  var text = obj.choices && obj.choices[0] &&
                             obj.choices[0].delta && obj.choices[0].delta.content;
                  if (text) {
                    // Insert before cursor
                    cursor.insertAdjacentText('beforebegin', text);
                    // Auto-scroll
                    ansWrap.scrollTop = ansWrap.scrollHeight;
                  }
                } catch(e) {}
              }
            });
            return pump();
          });
        }

        return pump();
      })
      .catch(function (err) {
        if (err.name === 'AbortError') return;
        var errDiv = el('div', {id:'ds-err', text:'❌ ' + err.message});
        ansDiv.textContent = '';
        ansDiv.appendChild(errDiv);
        // API key error hint
        if (err.message && err.message.includes('401')) {
          errDiv.textContent += ' — API Key 无效，点击 ⚙ Key 重新设置';
        }
      })
      .finally(function () {
        finish();
      });

      function finish() {
        state.streaming = false;
        submit.disabled = false;
        stop.style.display = 'none';
        var cur2 = ansDiv.querySelector('.ds-cursor');
        if (cur2) cur2.remove();
        // Format code blocks simply
        formatAnswer(ansDiv);
      }
    }
  }

  // ─── 简单 Markdown 格式化（代码块、行内代码）──────────────────────────────
  function formatAnswer(div) {
    var html = div.textContent
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      // code blocks
      .replace(/```(\w*)\n?([\s\S]*?)```/g, function(_, lang, code) {
        return '<pre style="background:#f1f5f9;padding:10px;border-radius:6px;overflow-x:auto;font-size:13px;margin:8px 0;"><code>' + code.trim() + '</code></pre>';
      })
      // inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // newlines
      .replace(/\n/g, '<br>');
    div.innerHTML = html;
  }

  // ─── 首次访问无 key → 2s 后轻提示 ────────────────────────────────────────
  if (!state.apiKey) {
    setTimeout(function () {
      fab.style.animation = 'ds-pulse 0.6s ease 3';
      var pulseStyle = document.createElement('style');
      pulseStyle.textContent = '@keyframes ds-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}';
      document.head.appendChild(pulseStyle);
    }, 2000);
  }

})();
