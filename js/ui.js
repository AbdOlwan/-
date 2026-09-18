/* ui.js — عناصر واجهة مشتركة: بناء العناصر، النوافذ المنبثقة، رسائل التنبيه */
(function (App) {
  'use strict';

  var TOAST_DURATION_MS = 2600;

  function append(parent, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (child) { append(parent, child); });
      return;
    }
    if (children instanceof Node) {
      parent.appendChild(children);
      return;
    }
    parent.appendChild(document.createTextNode(String(children)));
  }

  /* منشئ عناصر مختصر — يستخدم textContent دائمًا حتى لا تُفسَّر أسماء المستخدم كـ HTML */
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.keys(value).forEach(function (k) { node.dataset[k] = value[k]; });
        else if (key === 'style') node.setAttribute('style', value);
        else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'hidden') node[key] = !!value;
        else if (key === 'value') node.value = value;
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    append(node, children);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function field(labelText, control, hint) {
    return h('label', { class: 'field' }, [
      h('span', { text: labelText }),
      control,
      hint ? h('span', { class: 'field-hint', text: hint }) : null
    ]);
  }

  function textInput(attrs) {
    var options = attrs || {};
    options.type = options.type || 'text';
    return h('input', options);
  }

  function select(options, selectedValue, attrs) {
    var node = h('select', attrs || {});
    options.forEach(function (option) {
      node.appendChild(h('option', {
        value: option.value,
        text: option.label,
        disabled: option.disabled === true,
        selected: option.value === selectedValue
      }));
    });
    return node;
  }

  function toast(message, type) {
    var area = document.getElementById('toast-area');
    var node = h('div', { class: 'toast ' + ('toast-' + (type || 'info')), text: message });
    area.appendChild(node);
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, TOAST_DURATION_MS);
  }

  /* نافذة منبثقة عامة. actions = [{ label, variant, keepOpen, onClick }] */
  function modal(config) {
    var area = document.getElementById('modal-area');
    var previousFocus = document.activeElement;

    var body = h('div', { class: 'modal-body' }, config.content);
    var foot = h('div', { class: 'modal-foot' });
    var box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      h('div', { class: 'modal-head' }, h('h3', { text: config.title || '' })),
      body,
      foot
    ]);
    var backdrop = h('div', { class: 'modal-backdrop' }, box);

    function close() {
      document.removeEventListener('keydown', onKeyDown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (config.onCancel) config.onCancel();
        close();
      }
    }

    (config.actions || []).forEach(function (action) {
      if (action.spacer) {
        foot.appendChild(h('div', { class: 'btn-spacer' }));
        return;
      }
      foot.appendChild(h('button', {
        type: 'button',
        class: 'btn ' + (action.variant || ''),
        text: action.label,
        onclick: function () {
          var keep = action.onClick ? action.onClick(close) : false;
          if (!action.keepOpen && keep !== true) close();
        }
      }));
    });

    backdrop.addEventListener('mousedown', function (event) {
      if (event.target === backdrop) {
        if (config.onCancel) config.onCancel();
        close();
      }
    });

    document.addEventListener('keydown', onKeyDown);
    area.appendChild(backdrop);

    var firstControl = box.querySelector('input, select, textarea, button');
    if (firstControl) firstControl.focus();

    return { close: close, box: box };
  }

  /* تأكيد بنعم/لا — يرجع Promise */
  function confirm(config) {
    return new Promise(function (resolve) {
      var content = [];
      if (config.warning) content.push(h('div', { class: 'alert alert-danger', text: config.warning }));
      if (config.message) content.push(h('p', { text: config.message }));

      modal({
        title: config.title,
        content: content,
        onCancel: function () { resolve(false); },
        actions: [
          { label: config.cancelLabel || 'إلغاء', onClick: function () { resolve(false); } },
          {
            label: config.confirmLabel || 'متابعة',
            variant: config.danger ? 'btn-danger' : 'btn-primary',
            onClick: function () { resolve(true); }
          }
        ]
      });
    });
  }

  function emptyState(message) {
    return h('div', { class: 'empty-state', text: message });
  }

  App.UI = {
    h: h,
    clear: clear,
    field: field,
    textInput: textInput,
    select: select,
    toast: toast,
    modal: modal,
    confirm: confirm,
    emptyState: emptyState
  };

})(window.App = window.App || {});
