/* settings.js — بيانات المدرسة، الأيام، الحصص، الفصول، المواد، المدرسون، مسح البيانات */
(function (App) {
  'use strict';

  var UI = App.UI;
  var Storage = App.Storage;
  var h = UI.h;

  var activeDataTab = 'classes';

  /* ============ أدوات مساعدة ============ */

  function state() {
    return Storage.getState();
  }

  function lessonsUsing(key, id) {
    return state().lessons.filter(function (lesson) { return lesson[key] === id; });
  }

  function nameExists(list, name, exceptId) {
    var normalized = name.trim();
    return list.some(function (item) {
      return item.id !== exceptId && item.name === normalized;
    });
  }

  function card(title, description, content) {
    return h('section', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { text: title }),
        description ? h('p', { text: description }) : null
      ]),
      content
    ]);
  }

  /* ============ الإعدادات ============ */

  function renderSettings(container) {
    UI.clear(container);
    container.appendChild(schoolCard());
    container.appendChild(daysCard());
    container.appendChild(periodsCard());
    container.appendChild(App.Backup.renderCard());
    container.appendChild(dangerCard());
  }

  function schoolCard() {
    var school = state().school;

    function bind(key, maxLength) {
      return function (event) {
        state().school[key] = Storage.cleanText(event.target.value, maxLength);
        Storage.save();
        App.refreshHeader();
      };
    }

    var grid = h('div', { class: 'form-grid' }, [
      UI.field('اسم المدرسة / المعهد', UI.textInput({
        value: school.name,
        placeholder: 'معهد النور الأزهري',
        oninput: bind('name', 120)
      })),
      UI.field('العام الدراسي', UI.textInput({
        value: school.academicYear,
        placeholder: '2026 / 2027',
        oninput: bind('academicYear', 40)
      })),
      UI.field('الصف أو المرحلة (اختياري)', UI.textInput({
        value: school.stage,
        placeholder: 'المرحلة الإعدادية',
        oninput: bind('stage', 120)
      }))
    ]);

    var notes = UI.field('ملاحظات (اختياري)', h('textarea', {
      value: school.notes,
      placeholder: 'ملاحظات تظهر أسفل الجدول عند الطباعة',
      oninput: bind('notes', 400)
    }));

    return card('بيانات المدرسة', 'تظهر هذه البيانات في أعلى الجدول عند الطباعة.', [grid, notes]);
  }

  function daysCard() {
    var grid = h('div', { class: 'day-grid' });

    state().days.forEach(function (day) {
      var checkbox = h('input', {
        type: 'checkbox',
        checked: day.active,
        onchange: function (event) {
          onDayToggle(day, event.target);
        }
      });
      grid.appendChild(h('label', {
        class: 'day-toggle' + (day.active ? ' is-on' : '')
      }, [checkbox, h('span', { text: day.name })]));
    });

    return card('أيام الدراسة', 'اختر الأيام التي تظهر في الجدول.', grid);
  }

  function onDayToggle(day, checkbox) {
    if (checkbox.checked) {
      day.active = true;
      Storage.commit();
      return;
    }

    var used = lessonsUsing('dayId', day.id);
    if (!used.length) {
      day.active = false;
      Storage.commit();
      return;
    }

    checkbox.checked = true;
    UI.confirm({
      title: 'إيقاف يوم ' + day.name,
      warning: 'يوجد ' + used.length + ' حصة مسجلة في هذا اليوم وسيتم حذفها.',
      message: 'هل تريد المتابعة؟',
      confirmLabel: 'نعم، أوقف اليوم',
      danger: true
    }).then(function (agreed) {
      if (!agreed) return;
      day.active = false;
      state().lessons = state().lessons.filter(function (lesson) { return lesson.dayId !== day.id; });
      Storage.commit();
      UI.toast('تم إيقاف يوم ' + day.name, 'success');
    });
  }

  function periodsCard() {
    var periods = state().periods;
    var list = h('div');

    list.appendChild(h('div', { class: 'period-head' }, [
      h('span', { text: 'اسم الحصة' }),
      h('span', { text: 'من' }),
      h('span', { text: 'إلى' }),
      h('span', { text: '' })
    ]));

    periods.forEach(function (period, index) {
      list.appendChild(h('div', { class: 'period-row' }, [
        UI.textInput({
          name: 'period-name',
          value: period.name,
          placeholder: Storage.periodName(index),
          oninput: function (event) {
            period.name = Storage.cleanText(event.target.value, 60) || Storage.periodName(index);
            Storage.save();
          }
        }),
        h('input', {
          type: 'time',
          value: period.start,
          onchange: function (event) { period.start = event.target.value; Storage.save(); }
        }),
        h('input', {
          type: 'time',
          value: period.end,
          onchange: function (event) { period.end = event.target.value; Storage.save(); }
        }),
        h('button', {
          type: 'button',
          class: 'icon-btn',
          title: 'حذف الحصة',
          'aria-label': 'حذف ' + period.name,
          text: '×',
          onclick: function () { removePeriod(period); }
        })
      ]));
    });

    var addButton = h('button', {
      type: 'button',
      class: 'btn',
      text: '+ إضافة حصة',
      disabled: periods.length >= Storage.MAX_PERIOD_COUNT,
      onclick: function () {
        var current = state().periods;
        if (current.length >= Storage.MAX_PERIOD_COUNT) return;
        current.push({
          id: Storage.uid('per'),
          name: Storage.periodName(current.length),
          start: '',
          end: ''
        });
        Storage.commit();
      }
    });

    return card(
      'الحصص اليومية',
      'الأوقات اختيارية — يمكنك الاكتفاء بأسماء الحصص.',
      [list, h('div', { class: 'btn-row', style: 'margin-top:12px' }, addButton)]
    );
  }

  function removePeriod(period) {
    var periods = state().periods;
    if (periods.length <= Storage.MIN_PERIOD_COUNT) {
      UI.toast('لا يمكن حذف كل الحصص، يجب أن تبقى حصة واحدة على الأقل.', 'error');
      return;
    }

    var used = lessonsUsing('periodId', period.id);
    var run = function () {
      state().periods = periods.filter(function (item) { return item.id !== period.id; });
      state().lessons = state().lessons.filter(function (lesson) { return lesson.periodId !== period.id; });
      Storage.commit();
      UI.toast('تم حذف ' + period.name, 'success');
    };

    if (!used.length) {
      run();
      return;
    }

    UI.confirm({
      title: 'حذف ' + period.name,
      warning: 'يوجد ' + used.length + ' حصة مسجلة في هذا التوقيت وسيتم حذفها.',
      message: 'هل تريد المتابعة؟',
      confirmLabel: 'نعم، احذف',
      danger: true
    }).then(function (agreed) { if (agreed) run(); });
  }

  function dangerCard() {
    var button = h('button', {
      type: 'button',
      class: 'btn btn-danger',
      text: 'مسح جميع البيانات',
      onclick: confirmClearAll
    });

    return h('section', { class: 'card card-danger' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { text: 'مسح البيانات' }),
        h('p', { text: 'استخدم هذا الخيار للبدء من جديد. لا يمكن التراجع بعد المسح.' })
      ]),
      h('div', { class: 'btn-row' }, button)
    ]);
  }

  function confirmClearAll() {
    UI.confirm({
      title: 'مسح جميع البيانات',
      warning: 'سيتم حذف جميع الفصول والمواد والمدرسين والجداول المحفوظة على هذا الجهاز.',
      message: 'ننصح بتصدير نسخة احتياطية قبل المتابعة.',
      confirmLabel: 'متابعة',
      danger: true
    }).then(function (agreed) {
      if (!agreed) return;
      return UI.confirm({
        title: 'تأكيد أخير',
        message: 'هل أنت متأكد من حذف كل البيانات نهائيًا؟',
        confirmLabel: 'نعم، احذف كل البيانات',
        danger: true
      });
    }).then(function (agreed) {
      if (!agreed) return;
      Storage.reset();
      UI.toast('تم مسح جميع البيانات', 'success');
      App.showView('home');
    });
  }

  /* ============ إدارة البيانات ============ */

  var TABS = [
    { key: 'classes', label: 'الفصول' },
    { key: 'subjects', label: 'المواد' },
    { key: 'teachers', label: 'المدرسون' }
  ];

  function renderData(container) {
    UI.clear(container);

    var tabs = h('div', { class: 'subtabs' });
    TABS.forEach(function (tab) {
      tabs.appendChild(h('button', {
        type: 'button',
        class: 'subtab' + (activeDataTab === tab.key ? ' is-active' : ''),
        text: tab.label,
        onclick: function () {
          activeDataTab = tab.key;
          renderData(container);
        }
      }));
    });
    container.appendChild(tabs);

    if (activeDataTab === 'classes') container.appendChild(classesCard());
    else if (activeDataTab === 'subjects') container.appendChild(subjectsCard());
    else container.appendChild(teachersCard());
  }

  function addRow(placeholder, focusKey, onAdd) {
    var input = UI.textInput({
      placeholder: placeholder,
      dataset: { focusKey: focusKey },
      onkeydown: function (event) {
        if (event.key === 'Enter') { event.preventDefault(); submit(); }
      }
    });

    function submit() {
      var value = Storage.cleanText(input.value);
      if (!value) {
        UI.toast('اكتب الاسم أولًا.', 'error');
        input.focus();
        return;
      }
      // الإضافة تعيد رسم القائمة، لذلك نعيد التركيز على الحقل الجديد
      App.focusAfter('[data-focus-key="' + focusKey + '"]');
      if (onAdd(value) !== false) {
        input.value = '';
      } else {
        App.focusAfter(null);
        input.focus();
      }
    }

    return h('div', { class: 'inline-add' }, [
      input,
      h('button', { type: 'button', class: 'btn btn-primary', text: 'إضافة', onclick: submit })
    ]);
  }

  function listItem(parts) {
    return h('li', {}, [
      parts.lead || null,
      h('div', { class: 'item-main' }, [
        h('div', { class: 'item-name', text: parts.name }),
        parts.sub ? h('div', { class: 'item-sub', text: parts.sub }) : null
      ]),
      h('div', { class: 'item-actions' }, [
        h('button', { type: 'button', class: 'btn btn-sm', text: 'تعديل', onclick: parts.onEdit }),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'حذف', onclick: parts.onDelete })
      ])
    ]);
  }

  /* ---- الفصول ---- */

  function classesCard() {
    var classes = state().classes;

    var adder = addRow('مثال: ثانية إعدادي', 'add-class', function (name) {
      if (nameExists(classes, name)) {
        UI.toast('هذا الفصل موجود بالفعل.', 'error');
        return false;
      }
      classes.push({ id: Storage.uid('cls'), name: name });
      Storage.commit();
      UI.toast('تمت إضافة الفصل', 'success');
    });

    var body = [adder];

    if (!classes.length) {
      body.push(UI.emptyState('لا توجد فصول بعد. أضف أول فصل لتبدأ الجدول.'));
    } else {
      var list = h('ul', { class: 'item-list' });
      classes.forEach(function (item) {
        var count = lessonsUsing('classId', item.id).length;
        list.appendChild(listItem({
          name: item.name,
          sub: count ? count + ' حصة مسجلة' : 'لا توجد حصص بعد',
          onEdit: function () { editName('تعديل اسم الفصل', item, classes); },
          onDelete: function () { deleteClass(item, count); }
        }));
      });
      body.push(list);
    }

    return card('الفصول', 'الفصول أو الصفوف التي تريد إعداد جدول لها.', body);
  }

  function deleteClass(item, count) {
    var run = function () {
      state().classes = state().classes.filter(function (row) { return row.id !== item.id; });
      state().lessons = state().lessons.filter(function (lesson) { return lesson.classId !== item.id; });
      if (state().prefs.activeClassId === item.id) state().prefs.activeClassId = null;
      Storage.commit();
      UI.toast('تم حذف الفصل', 'success');
    };

    UI.confirm({
      title: 'حذف ' + item.name,
      warning: count ? 'سيتم حذف جدول هذا الفصل أيضًا (' + count + ' حصة).' : null,
      message: 'لا يمكن التراجع بعد الحذف.',
      confirmLabel: 'نعم، احذف',
      danger: true
    }).then(function (agreed) { if (agreed) run(); });
  }

  /* ---- المواد ---- */

  function subjectsCard() {
    var subjects = state().subjects;

    var adder = addRow('مثال: القرآن الكريم', 'add-subject', function (name) {
      if (nameExists(subjects, name)) {
        UI.toast('هذه المادة موجودة بالفعل.', 'error');
        return false;
      }
      var color = Storage.SUBJECT_COLORS[subjects.length % Storage.SUBJECT_COLORS.length];
      subjects.push({ id: Storage.uid('sub'), name: name, color: color });
      Storage.commit();
      UI.toast('تمت إضافة المادة', 'success');
    });

    var body = [adder];

    if (!subjects.length) {
      body.push(UI.emptyState('لا توجد مواد بعد. أضف المواد التي تُدرَّس عندك.'));
    } else {
      var list = h('ul', { class: 'item-list' });
      subjects.forEach(function (item) {
        var count = lessonsUsing('subjectId', item.id).length;
        list.appendChild(listItem({
          lead: h('span', {
            class: 'color-dot',
            style: item.color ? 'background:' + item.color : 'background:transparent'
          }),
          name: item.name,
          sub: count ? count + ' حصة في الجداول' : 'غير مستخدمة بعد',
          onEdit: function () { editSubject(item); },
          onDelete: function () { deleteSubject(item, count); }
        }));
      });
      body.push(list);
    }

    return card('المواد', 'اللون اختياري ويساعد على تمييز المادة داخل الجدول.', body);
  }

  function editSubject(item) {
    var nameInput = UI.textInput({ value: item.name });
    var chosen = item.color || '';
    var swatches = h('div', { class: 'day-grid' });

    function paint() {
      Array.prototype.forEach.call(swatches.children, function (node) {
        node.classList.toggle('is-on', node.dataset.color === chosen);
      });
    }

    [''].concat(Storage.SUBJECT_COLORS).forEach(function (color) {
      swatches.appendChild(h('button', {
        type: 'button',
        class: 'day-toggle',
        dataset: { color: color },
        onclick: function () { chosen = color; paint(); }
      }, [
        h('span', { class: 'color-dot', style: color ? 'background:' + color : 'background:transparent' }),
        h('span', { text: color ? 'لون' : 'بدون لون' })
      ]));
    });
    paint();

    UI.modal({
      title: 'تعديل المادة',
      content: [
        UI.field('اسم المادة', nameInput),
        h('div', { class: 'field' }, [h('span', { text: 'لون المادة' }), swatches])
      ],
      actions: [
        { label: 'إلغاء' },
        {
          label: 'حفظ',
          variant: 'btn-primary',
          onClick: function () {
            var name = Storage.cleanText(nameInput.value);
            if (!name) { UI.toast('اكتب اسم المادة أولًا.', 'error'); return true; }
            if (nameExists(state().subjects, name, item.id)) {
              UI.toast('هذه المادة موجودة بالفعل.', 'error');
              return true;
            }
            item.name = name;
            item.color = chosen;
            Storage.commit();
            UI.toast('تم حفظ التعديل', 'success');
          }
        }
      ]
    });
  }

  function deleteSubject(item, count) {
    if (count) {
      UI.modal({
        title: 'لا يمكن حذف المادة',
        content: h('p', { text: 'المادة «' + item.name + '» مستخدمة في ' + count + ' حصة. احذف هذه الحصص من الجدول أولًا.' }),
        actions: [{ label: 'حسنًا', variant: 'btn-primary' }]
      });
      return;
    }
    UI.confirm({
      title: 'حذف ' + item.name,
      message: 'سيتم حذف المادة من القائمة.',
      confirmLabel: 'نعم، احذف',
      danger: true
    }).then(function (agreed) {
      if (!agreed) return;
      state().subjects = state().subjects.filter(function (row) { return row.id !== item.id; });
      state().teachers.forEach(function (teacher) {
        teacher.subjectIds = teacher.subjectIds.filter(function (id) { return id !== item.id; });
      });
      Storage.commit();
      UI.toast('تم حذف المادة', 'success');
    });
  }

  /* ---- المدرسون ---- */

  function teachersCard() {
    var teachers = state().teachers;

    var adder = addRow('مثال: أحمد محمد', 'add-teacher', function (name) {
      if (nameExists(teachers, name)) {
        UI.toast('هذا المدرس موجود بالفعل.', 'error');
        return false;
      }
      teachers.push({ id: Storage.uid('tch'), name: name, subjectIds: [] });
      Storage.commit();
      UI.toast('تمت إضافة المدرس', 'success');
    });

    var body = [adder];

    if (!teachers.length) {
      body.push(UI.emptyState('لا يوجد مدرسون بعد. أضف المدرسين لتوزيعهم على الحصص.'));
    } else {
      var list = h('ul', { class: 'item-list' });
      teachers.forEach(function (item) {
        var count = lessonsUsing('teacherId', item.id).length;
        list.appendChild(listItem({
          name: item.name,
          sub: subjectNamesOf(item) || 'لم تُحدد مواد',
          onEdit: function () { editTeacher(item); },
          onDelete: function () { deleteTeacher(item, count); }
        }));
      });
      body.push(list);
    }

    return card('المدرسون', 'تحديد المواد اختياري، لكنه يسهّل اختيار المدرس المناسب في الجدول.', body);
  }

  function subjectNamesOf(teacher) {
    var names = teacher.subjectIds.map(function (id) {
      var subject = Storage.byId(state().subjects, id);
      return subject ? subject.name : null;
    }).filter(Boolean);
    return names.join('، ');
  }

  function editTeacher(item) {
    var nameInput = UI.textInput({ value: item.name });
    var selected = item.subjectIds.slice();
    var subjects = state().subjects;

    var picker = h('div', { class: 'day-grid' });
    if (!subjects.length) {
      picker.appendChild(h('span', { class: 'field-hint', text: 'أضف المواد أولًا من تبويب المواد.' }));
    }
    subjects.forEach(function (subject) {
      var isOn = selected.indexOf(subject.id) !== -1;
      var checkbox = h('input', {
        type: 'checkbox',
        checked: isOn,
        onchange: function (event) {
          if (event.target.checked) {
            if (selected.indexOf(subject.id) === -1) selected.push(subject.id);
          } else {
            selected = selected.filter(function (id) { return id !== subject.id; });
          }
          event.target.parentNode.classList.toggle('is-on', event.target.checked);
        }
      });
      picker.appendChild(h('label', {
        class: 'day-toggle' + (isOn ? ' is-on' : '')
      }, [checkbox, h('span', { text: subject.name })]));
    });

    UI.modal({
      title: 'تعديل المدرس',
      content: [
        UI.field('اسم المدرس', nameInput),
        h('div', { class: 'field' }, [h('span', { text: 'المواد التي يدرسها (اختياري)' }), picker])
      ],
      actions: [
        { label: 'إلغاء' },
        {
          label: 'حفظ',
          variant: 'btn-primary',
          onClick: function () {
            var name = Storage.cleanText(nameInput.value);
            if (!name) { UI.toast('اكتب اسم المدرس أولًا.', 'error'); return true; }
            if (nameExists(state().teachers, name, item.id)) {
              UI.toast('هذا المدرس موجود بالفعل.', 'error');
              return true;
            }
            item.name = name;
            item.subjectIds = selected;
            Storage.commit();
            UI.toast('تم حفظ التعديل', 'success');
          }
        }
      ]
    });
  }

  function deleteTeacher(item, count) {
    if (count) {
      UI.modal({
        title: 'لا يمكن حذف المدرس',
        content: h('p', { text: 'لا يمكن حذف «' + item.name + '» لأنه مستخدم في ' + count + ' حصة داخل الجداول. احذف حصصه أو غيّر المدرس أولًا.' }),
        actions: [{ label: 'حسنًا', variant: 'btn-primary' }]
      });
      return;
    }
    UI.confirm({
      title: 'حذف ' + item.name,
      message: 'سيتم حذف المدرس من القائمة.',
      confirmLabel: 'نعم، احذف',
      danger: true
    }).then(function (agreed) {
      if (!agreed) return;
      state().teachers = state().teachers.filter(function (row) { return row.id !== item.id; });
      Storage.commit();
      UI.toast('تم حذف المدرس', 'success');
    });
  }

  /* ---- تعديل اسم بسيط ---- */

  function editName(title, item, list) {
    var input = UI.textInput({ value: item.name });
    UI.modal({
      title: title,
      content: UI.field('الاسم', input),
      actions: [
        { label: 'إلغاء' },
        {
          label: 'حفظ',
          variant: 'btn-primary',
          onClick: function () {
            var name = Storage.cleanText(input.value);
            if (!name) { UI.toast('اكتب الاسم أولًا.', 'error'); return true; }
            if (nameExists(list, name, item.id)) {
              UI.toast('هذا الاسم موجود بالفعل.', 'error');
              return true;
            }
            item.name = name;
            Storage.commit();
            UI.toast('تم حفظ التعديل', 'success');
          }
        }
      ]
    });
  }

  App.Settings = {
    renderSettings: renderSettings,
    renderData: renderData,
    openDataTab: function (key) { activeDataTab = key; }
  };

})(window.App = window.App || {});
