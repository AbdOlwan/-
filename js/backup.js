/* backup.js — تصدير واستيراد النسخة الاحتياطية والتحقق من صحة الملف */
(function (App) {
  'use strict';

  var UI = App.UI;
  var Storage = App.Storage;
  var h = UI.h;

  var MAX_FILE_BYTES = 5 * 1024 * 1024;

  function state() {
    return Storage.getState();
  }

  function safeFileName() {
    var year = state().school.academicYear.replace(/[\\/\s:*?"<>|]+/g, '-').replace(/^-+|-+$/g, '');
    if (!year) {
      var now = new Date();
      year = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
    }
    return 'schedule-backup-' + year + '.json';
  }

  function exportBackup() {
    var payload = JSON.parse(JSON.stringify(state()));
    payload.exportedAt = new Date().toISOString();

    var text = JSON.stringify(payload, null, 2);
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);

    var link = h('a', { href: url, download: safeFileName() });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    UI.toast('تم تصدير النسخة الاحتياطية', 'success');
  }

  function looksValid(data) {
    if (!Storage.isObject(data)) return false;
    if (!Storage.isObject(data.school)) return false;
    var required = ['classes', 'subjects', 'teachers', 'lessons'];
    for (var i = 0; i < required.length; i++) {
      if (!Storage.isArray(data[required[i]])) return false;
    }
    return true;
  }

  function summaryOf(data) {
    var normalized = Storage.normalize(data);
    return 'الفصول: ' + normalized.classes.length +
      ' — المواد: ' + normalized.subjects.length +
      ' — المدرسون: ' + normalized.teachers.length +
      ' — الحصص: ' + normalized.lessons.length;
  }

  function importFromFile(file, input) {
    var done = function () { if (input) input.value = ''; };

    if (!file) { done(); return; }
    if (file.size > MAX_FILE_BYTES) {
      UI.toast('حجم الملف كبير جدًا ولا يبدو أنه نسخة احتياطية.', 'error');
      done();
      return;
    }

    var reader = new FileReader();

    reader.onerror = function () {
      UI.toast('تعذّرت قراءة الملف.', 'error');
      done();
    };

    reader.onload = function () {
      var data = null;
      try {
        data = JSON.parse(String(reader.result));
      } catch (error) {
        data = null;
      }

      if (!looksValid(data)) {
        UI.modal({
          title: 'ملف غير صالح',
          content: h('p', { text: 'ملف النسخة الاحتياطية غير صالح أو تالف. اختر ملفًا تم تصديره من هذا التطبيق.' }),
          actions: [{ label: 'حسنًا', variant: 'btn-primary' }]
        });
        done();
        return;
      }

      UI.confirm({
        title: 'استيراد نسخة احتياطية',
        warning: 'استيراد النسخة الاحتياطية سيستبدل البيانات الحالية.',
        message: 'محتوى الملف — ' + summaryOf(data),
        confirmLabel: 'نعم، استورد',
        danger: true
      }).then(function (agreed) {
        done();
        if (!agreed) return;
        Storage.replaceState(data);
        UI.toast('تم استيراد النسخة الاحتياطية', 'success');
        App.showView('home');
      });
    };

    reader.readAsText(file, 'utf-8');
  }

  function renderCard() {
    var fileInput = h('input', {
      type: 'file',
      accept: '.json,application/json',
      style: 'display:none',
      onchange: function (event) {
        importFromFile(event.target.files[0], event.target);
      }
    });

    var buttons = h('div', { class: 'btn-row' }, [
      h('button', { type: 'button', class: 'btn btn-primary', text: 'تصدير نسخة احتياطية', onclick: exportBackup }),
      h('button', {
        type: 'button',
        class: 'btn',
        text: 'استيراد نسخة احتياطية',
        onclick: function () { fileInput.click(); }
      }),
      fileInput
    ]);

    return h('section', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { text: 'النسخ الاحتياطي' }),
        h('p', { text: 'البيانات محفوظة على هذا الجهاز فقط. مسح بيانات المتصفح أو تغيير الجهاز يعني فقدانها، لذلك احتفظ بنسخة من وقت لآخر.' })
      ]),
      buttons
    ]);
  }

  App.Backup = {
    renderCard: renderCard,
    exportBackup: exportBackup
  };

})(window.App = window.App || {});
