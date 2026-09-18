/* app.js — التشغيل، التنقل بين الشاشات، الصفحة الرئيسية */
(function (App) {
  'use strict';

  var UI = App.UI;
  var Storage = App.Storage;
  var h = UI.h;

  var SAVE_BADGE_MS = 1400;

  var currentView = 'home';
  var pendingFocus = null;
  var badgeTimer = null;

  function state() {
    return Storage.getState();
  }

  /* ============ التنقل ============ */

  var RENDERERS = {
    home: renderHome,
    schedule: function (container) { App.Schedule.render(container); },
    data: function (container) { App.Settings.renderData(container); },
    settings: function (container) { App.Settings.renderSettings(container); }
  };

  function showView(name) {
    currentView = RENDERERS[name] ? name : 'home';
    renderCurrent();
    window.scrollTo(0, 0);
  }

  function renderCurrent() {
    Object.keys(RENDERERS).forEach(function (name) {
      var section = document.getElementById('view-' + name);
      section.hidden = name !== currentView;
    });

    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (button) {
      button.classList.toggle('is-active', button.dataset.nav === currentView);
    });

    RENDERERS[currentView](document.getElementById('view-' + currentView));
    refreshHeader();
    applyPendingFocus();
  }

  function applyPendingFocus() {
    if (!pendingFocus) return;
    var node = document.querySelector(pendingFocus);
    pendingFocus = null;
    if (node) node.focus();
  }

  function focusAfter(selector) {
    pendingFocus = selector;
  }

  function refreshHeader() {
    var school = state().school;
    document.getElementById('header-school-name').textContent = school.name || 'جدول الحصص';
    var subtitle = school.academicYear
      ? 'نظام إعداد جدول الحصص — ' + school.academicYear
      : 'نظام إعداد جدول الحصص';
    document.getElementById('header-subtitle').textContent = subtitle;
    document.title = school.name ? ('جدول الحصص — ' + school.name) : 'جدول الحصص';
  }

  /* ============ الصفحة الرئيسية ============ */

  function renderHome(container) {
    UI.clear(container);
    container.appendChild(hero());
    container.appendChild(stats());

    var steps = pendingSteps();
    if (steps.length) container.appendChild(stepsCard(steps));
  }

  function hero() {
    var school = state().school;

    var actions = h('div', { class: 'home-actions' }, [
      h('button', {
        type: 'button',
        class: 'btn btn-primary btn-lg',
        text: 'فتح جدول الحصص',
        onclick: function () { showView('schedule'); }
      }),
      h('button', {
        type: 'button',
        class: 'btn',
        text: 'إدارة البيانات',
        onclick: function () { showView('data'); }
      }),
      h('button', {
        type: 'button',
        class: 'btn',
        text: 'طباعة الجدول',
        onclick: function () {
          var current = App.Schedule.activeClass();
          App.Print.openDialog(current ? current.id : null);
        }
      })
    ]);

    return h('section', { class: 'home-hero' }, [
      h('h2', { text: school.name || 'جدول الحصص' }),
      h('p', { class: 'hero-meta', text: school.academicYear ? 'العام الدراسي ' + school.academicYear : 'أضف اسم المدرسة والعام الدراسي من الإعدادات' }),
      school.stage ? h('p', { class: 'hero-meta', text: school.stage }) : null,
      actions
    ]);
  }

  function stats() {
    var data = state();
    var grid = h('div', { class: 'stat-grid' });

    [
      { label: 'الفصول', value: data.classes.length },
      { label: 'المواد', value: data.subjects.length },
      { label: 'المدرسون', value: data.teachers.length },
      { label: 'الحصص المسجلة', value: data.lessons.length }
    ].forEach(function (item) {
      grid.appendChild(h('div', { class: 'stat' }, [
        h('div', { class: 'stat-value', text: String(item.value) }),
        h('div', { class: 'stat-label', text: item.label })
      ]));
    });

    return grid;
  }

  function pendingSteps() {
    var data = state();
    var steps = [
      { text: 'اكتب اسم المدرسة والعام الدراسي', done: !!data.school.name, view: 'settings' },
      { text: 'حدد أيام الدراسة والحصص', done: Storage.activeDays().length > 0, view: 'settings' },
      { text: 'أضف الفصول', done: data.classes.length > 0, view: 'data', tab: 'classes' },
      { text: 'أضف المواد', done: data.subjects.length > 0, view: 'data', tab: 'subjects' },
      { text: 'أضف المدرسين', done: data.teachers.length > 0, view: 'data', tab: 'teachers' },
      { text: 'ابدأ بناء الجدول', done: data.lessons.length > 0, view: 'schedule' }
    ];
    return steps.every(function (step) { return step.done; }) ? [] : steps;
  }

  function stepsCard(steps) {
    var list = h('ul', { class: 'steps' });

    steps.forEach(function (step) {
      list.appendChild(h('li', { class: step.done ? 'is-done' : '' }, [
        h('span', { class: 'step-mark', text: step.done ? '✓' : '' }),
        h('button', {
          type: 'button',
          class: 'step-text',
          text: step.text,
          onclick: function () {
            if (step.tab) App.Settings.openDataTab(step.tab);
            showView(step.view);
          }
        })
      ]));
    });

    return h('section', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { text: 'خطوات الإعداد' }),
        h('p', { text: 'اضغط على أي خطوة للانتقال إليها.' })
      ]),
      list
    ]);
  }

  /* ============ مؤشر الحفظ ============ */

  function flashSaveBadge() {
    var badge = document.getElementById('save-badge');
    badge.classList.add('is-visible');
    if (badgeTimer) window.clearTimeout(badgeTimer);
    badgeTimer = window.setTimeout(function () {
      badge.classList.remove('is-visible');
    }, SAVE_BADGE_MS);
  }

  /* ============ التشغيل ============ */

  function startSetup() {
    state().prefs.setupStarted = true;
    Storage.save();
    document.getElementById('view-welcome').hidden = true;
    document.getElementById('app-shell').hidden = false;
    showView('settings');
  }

  function init() {
    Storage.load();

    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (button) {
      button.addEventListener('click', function () { showView(button.dataset.nav); });
    });

    document.getElementById('welcome-start').addEventListener('click', startSetup);

    document.addEventListener('app:changed', renderCurrent);
    document.addEventListener('app:saved', flashSaveBadge);
    document.addEventListener('app:save-failed', function () {
      UI.toast('تعذّر الحفظ على هذا الجهاز. تأكد من وجود مساحة كافية في المتصفح.', 'error');
    });

    if (!state().prefs.setupStarted) {
      document.getElementById('view-welcome').hidden = false;
      document.getElementById('app-shell').hidden = true;
      refreshHeader();
      return;
    }

    document.getElementById('view-welcome').hidden = true;
    document.getElementById('app-shell').hidden = false;
    showView('home');
  }

  App.showView = showView;
  App.refreshHeader = refreshHeader;
  App.focusAfter = focusAfter;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window.App = window.App || {});
