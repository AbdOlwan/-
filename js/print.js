/* print.js — تجهيز نسخة الطباعة وفتح نافذة الطباعة في المتصفح */
(function (App) {
  'use strict';

  var UI = App.UI;
  var Storage = App.Storage;
  var h = UI.h;

  function state() {
    return Storage.getState();
  }

  function buildPage(klass) {
    var school = state().school;
    var days = Storage.activeDays();
    var periods = state().periods;

    var head = h('div', { class: 'print-head' }, [
      h('div', { class: 'print-school', text: school.name || 'جدول الحصص' }),
      school.academicYear ? h('div', { class: 'print-meta', text: 'العام الدراسي ' + school.academicYear }) : null,
      school.stage ? h('div', { class: 'print-meta', text: school.stage }) : null,
      h('div', { class: 'print-class', text: 'جدول حصص فصل: ' + klass.name })
    ]);

    var headRow = h('tr', {}, h('th', { class: 'print-period', text: 'الحصة' }));
    days.forEach(function (day) {
      headRow.appendChild(h('th', { text: day.name }));
    });

    var body = h('tbody');
    periods.forEach(function (period) {
      var row = h('tr', {}, h('th', { class: 'print-period' }, [
        h('div', { class: 'print-period-name', text: period.name }),
        (period.start || period.end)
          ? h('div', { class: 'print-period-time', text: (period.start || '') + ' - ' + (period.end || '') })
          : null
      ]));

      days.forEach(function (day) {
        var lesson = App.Schedule.lessonAt(klass.id, day.id, period.id);
        if (!lesson) {
          row.appendChild(h('td', { text: '' }));
          return;
        }
        var subject = Storage.byId(state().subjects, lesson.subjectId);
        var teacher = Storage.byId(state().teachers, lesson.teacherId);
        row.appendChild(h('td', {}, [
          h('div', { class: 'print-subject', text: subject ? subject.name : '' }),
          teacher ? h('div', { class: 'print-teacher', text: teacher.name }) : null,
          lesson.note ? h('div', { class: 'print-note', text: lesson.note }) : null
        ]));
      });

      body.appendChild(row);
    });

    var table = h('table', { class: 'print-table' }, [h('thead', {}, headRow), body]);

    return h('div', { class: 'print-page' }, [
      head,
      table,
      school.notes ? h('div', { class: 'print-foot', text: school.notes }) : null
    ]);
  }

  function printClasses(classes) {
    var root = document.getElementById('print-root');
    UI.clear(root);
    classes.forEach(function (klass) {
      root.appendChild(buildPage(klass));
    });
    window.print();
  }

  function openDialog(preferredClassId) {
    var classes = state().classes;

    if (!classes.length) {
      UI.modal({
        title: 'لا توجد فصول',
        content: h('p', { text: 'أضف فصلًا وابنِ جدوله قبل الطباعة.' }),
        actions: [{ label: 'حسنًا', variant: 'btn-primary' }]
      });
      return;
    }

    if (!Storage.activeDays().length) {
      UI.modal({
        title: 'لا توجد أيام دراسة',
        content: h('p', { text: 'حدد أيام الدراسة من «الإعدادات» قبل الطباعة.' }),
        actions: [{ label: 'حسنًا', variant: 'btn-primary' }]
      });
      return;
    }

    var current = Storage.byId(classes, preferredClassId) || classes[0];
    var choice = current.id;

    var options = classes.map(function (item) {
      return { value: item.id, label: 'فصل ' + item.name };
    });
    if (classes.length > 1) {
      options.push({ value: '__all', label: 'كل الفصول (كل فصل في صفحة)' });
    }

    var picker = UI.select(options, choice, {
      onchange: function (event) { choice = event.target.value; }
    });

    UI.modal({
      title: 'طباعة الجدول',
      content: [
        UI.field('اختر الجدول المطلوب', picker),
        h('p', { class: 'field-hint', text: 'من نافذة الطباعة يمكنك اختيار «حفظ كملف PDF» بدل الطباعة الورقية.' })
      ],
      actions: [
        {
          label: 'طباعة',
          variant: 'btn-primary',
          onClick: function () {
            var target = choice === '__all' ? classes : [Storage.byId(classes, choice)];
            window.setTimeout(function () { printClasses(target); }, 60);
          }
        },
        { label: 'إلغاء' }
      ]
    });
  }

  App.Print = {
    openDialog: openDialog
  };

})(window.App = window.App || {});
