/* schedule.js — بناء الجدول، إضافة وتعديل وحذف الحصص، اكتشاف التعارضات */
(function (App) {
  'use strict';

  var UI = App.UI;
  var Storage = App.Storage;
  var h = UI.h;

  var MAX_CHIPS = 8;

  function state() {
    return Storage.getState();
  }

  /* ============ منطق التعارض ============ */

  function findTeacherConflict(candidate) {
    if (!candidate.teacherId) return null;
    var lessons = state().lessons;
    for (var i = 0; i < lessons.length; i++) {
      var lesson = lessons[i];
      if (lesson.id === candidate.id) continue;
      if (lesson.teacherId !== candidate.teacherId) continue;
      if (lesson.dayId !== candidate.dayId) continue;
      if (lesson.periodId !== candidate.periodId) continue;
      return lesson;
    }
    return null;
  }

  function conflictCount(classId) {
    return state().lessons.filter(function (lesson) {
      return lesson.classId === classId && findTeacherConflict(lesson) !== null;
    }).length;
  }

  function busyTeacherIds(dayId, periodId, exceptLessonId) {
    var ids = {};
    state().lessons.forEach(function (lesson) {
      if (lesson.id === exceptLessonId) return;
      if (lesson.dayId !== dayId || lesson.periodId !== periodId) return;
      if (lesson.teacherId) ids[lesson.teacherId] = true;
    });
    return ids;
  }

  function lessonAt(classId, dayId, periodId) {
    var lessons = state().lessons;
    for (var i = 0; i < lessons.length; i++) {
      var lesson = lessons[i];
      if (lesson.classId === classId && lesson.dayId === dayId && lesson.periodId === periodId) {
        return lesson;
      }
    }
    return null;
  }

  function conflictMessage(lesson) {
    var teacher = Storage.byId(state().teachers, lesson.teacherId);
    var day = Storage.byId(state().days, lesson.dayId);
    var period = Storage.byId(state().periods, lesson.periodId);
    var klass = Storage.byId(state().classes, lesson.classId);
    return 'المدرس ' + (teacher ? teacher.name : '') +
      ' موجود بالفعل في ' + (period ? period.name : '') +
      ' يوم ' + (day ? day.name : '') +
      ' مع فصل ' + (klass ? klass.name : '') + '.';
  }

  /* ============ الفصل الحالي ============ */

  function activeClass() {
    var classes = state().classes;
    if (!classes.length) return null;
    var found = Storage.byId(classes, state().prefs.activeClassId);
    return found || classes[0];
  }

  function setActiveClass(id) {
    state().prefs.activeClassId = id;
    Storage.commit();
  }

  /* ============ العرض ============ */

  function render(container) {
    UI.clear(container);

    var classes = state().classes;
    if (!classes.length) {
      container.appendChild(noClassesCard());
      return;
    }

    var current = activeClass();
    container.appendChild(classBar(classes, current));

    if (!state().subjects.length) {
      container.appendChild(h('div', { class: 'alert alert-warn' },
        'أضف المواد أولًا من «إدارة البيانات» حتى تستطيع تسجيل الحصص.'));
    }

    container.appendChild(summaryBar(current));
    container.appendChild(tableFor(current));
    container.appendChild(h('div', { class: 'btn-row', style: 'margin-top:16px' }, [
      h('button', {
        type: 'button',
        class: 'btn btn-primary',
        text: 'طباعة الجدول',
        onclick: function () { App.Print.openDialog(current.id); }
      }),
      h('button', {
        type: 'button',
        class: 'btn',
        text: 'إدارة البيانات',
        onclick: function () { App.showView('data'); }
      })
    ]));
  }

  function noClassesCard() {
    return h('section', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { text: 'لا توجد فصول بعد' }),
        h('p', { text: 'أضف فصلًا واحدًا على الأقل لتبدأ بناء الجدول.' })
      ]),
      h('div', { class: 'btn-row' }, h('button', {
        type: 'button',
        class: 'btn btn-primary',
        text: 'إضافة فصل',
        onclick: function () {
          App.Settings.openDataTab('classes');
          App.showView('data');
        }
      }))
    ]);
  }

  function classBar(classes, current) {
    var bar = h('div', { class: 'class-bar' }, h('span', { text: 'اختر الفصل:' }));

    if (classes.length > MAX_CHIPS) {
      bar.appendChild(UI.select(
        classes.map(function (item) { return { value: item.id, label: item.name }; }),
        current.id,
        {
          class: 'class-select',
          onchange: function (event) { setActiveClass(event.target.value); }
        }
      ));
      return bar;
    }

    classes.forEach(function (item) {
      bar.appendChild(h('button', {
        type: 'button',
        class: 'class-chip' + (item.id === current.id ? ' is-active' : ''),
        text: item.name,
        onclick: function () { setActiveClass(item.id); }
      }));
    });
    return bar;
  }

  function summaryBar(current) {
    var days = Storage.activeDays();
    var periods = state().periods;
    var total = days.length * periods.length;
    var filled = state().lessons.filter(function (lesson) {
      return lesson.classId === current.id;
    }).length;
    var conflicts = conflictCount(current.id);
    var percent = total ? Math.round((filled / total) * 100) : 0;

    function item(label, value, isBad) {
      return h('div', { class: 'summary-item' + (isBad ? ' has-conflict' : '') }, [
        h('div', { class: 'summary-label', text: label }),
        h('div', { class: 'summary-value', text: value })
      ]);
    }

    return h('div', { class: 'summary-bar' }, [
      item('الفصل', current.name, false),
      item('عدد الحصص', String(filled), false),
      item('التعارضات', String(conflicts), conflicts > 0),
      item('الجدول مكتمل', percent + '%', false)
    ]);
  }

  function tableFor(current) {
    var days = Storage.activeDays();
    var periods = state().periods;

    if (!days.length) {
      return h('div', { class: 'alert alert-warn' },
        'لم تختر أي يوم دراسة. حدد الأيام من «الإعدادات».');
    }

    var head = h('tr', {}, h('th', { class: 'period-col', text: 'الحصة' }));
    days.forEach(function (day) {
      head.appendChild(h('th', { scope: 'col', text: day.name }));
    });

    var body = h('tbody');
    periods.forEach(function (period) {
      var row = h('tr', {}, h('th', { class: 'period-col', scope: 'row' }, [
        h('div', { class: 'period-name', text: period.name }),
        (period.start || period.end)
          ? h('div', { class: 'period-time', text: (period.start || '') + ' - ' + (period.end || '') })
          : null
      ]));

      days.forEach(function (day) {
        row.appendChild(cellFor(current, day, period));
      });
      body.appendChild(row);
    });

    return h('div', { class: 'table-scroll' },
      h('table', { class: 'schedule' }, [h('thead', {}, head), body]));
  }

  function cellFor(current, day, period) {
    var lesson = lessonAt(current.id, day.id, period.id);
    var cell = h('td');

    if (!lesson) {
      cell.appendChild(h('button', {
        type: 'button',
        class: 'cell-btn cell-empty',
        text: '+',
        'aria-label': 'إضافة حصة — ' + day.name + ' ' + period.name,
        onclick: function () { openLessonModal(current, day, period, null); }
      }));
      return cell;
    }

    var subject = Storage.byId(state().subjects, lesson.subjectId);
    var teacher = Storage.byId(state().teachers, lesson.teacherId);
    var conflict = findTeacherConflict(lesson);

    cell.className = 'has-lesson' + (conflict ? ' is-conflict' : '');
    if (subject && subject.color) cell.style.borderRightColor = subject.color;

    cell.appendChild(h('button', {
      type: 'button',
      class: 'cell-btn',
      title: conflict ? conflictMessage(conflict) : 'تعديل الحصة',
      onclick: function () { openLessonModal(current, day, period, lesson); }
    }, [
      h('div', { class: 'cell-subject', text: subject ? subject.name : '' }),
      teacher ? h('div', { class: 'cell-teacher', text: teacher.name }) : null,
      lesson.note ? h('div', { class: 'cell-note', text: lesson.note }) : null,
      conflict ? h('div', { class: 'conflict-tag', text: 'تعارض' }) : null
    ]));

    return cell;
  }

  /* ============ نافذة الحصة ============ */

  function teacherOptions(subjectId, dayId, periodId, exceptLessonId) {
    var busy = busyTeacherIds(dayId, periodId, exceptLessonId);
    var preferred = [];
    var others = [];

    state().teachers.forEach(function (teacher) {
      var label = teacher.name + (busy[teacher.id] ? ' — مشغول في هذا الوقت' : '');
      var option = { value: teacher.id, label: label };
      if (subjectId && teacher.subjectIds.indexOf(subjectId) !== -1) preferred.push(option);
      else others.push(option);
    });

    var options = [{ value: '', label: 'بدون مدرس' }];
    if (preferred.length) {
      options.push({ value: '__g1', label: '— مدرسو المادة —', disabled: true });
      options = options.concat(preferred);
    }
    if (others.length) {
      if (preferred.length) options.push({ value: '__g2', label: '— مدرسون آخرون —', disabled: true });
      options = options.concat(others);
    }
    return options;
  }

  function openLessonModal(current, day, period, lesson) {
    var isEdit = lesson !== null;
    var subjects = state().subjects;

    if (!subjects.length) {
      UI.modal({
        title: 'لا توجد مواد',
        content: h('p', { text: 'أضف المواد من «إدارة البيانات» قبل تسجيل الحصص.' }),
        actions: [
          { label: 'إلغاء' },
          {
            label: 'إضافة المواد',
            variant: 'btn-primary',
            onClick: function () {
              App.Settings.openDataTab('subjects');
              App.showView('data');
            }
          }
        ]
      });
      return;
    }

    var chosenSubject = isEdit ? lesson.subjectId : '';
    var chosenTeacher = isEdit ? (lesson.teacherId || '') : '';
    var acknowledgedConflict = false;

    var alertSlot = h('div');

    var subjectSelect = UI.select(
      [{ value: '', label: 'اختر المادة' }].concat(subjects.map(function (item) {
        return { value: item.id, label: item.name };
      })),
      chosenSubject,
      {
        onchange: function (event) {
          chosenSubject = event.target.value;
          rebuildTeachers();
          resetConflict();
        }
      }
    );

    var teacherWrap = h('div');
    var teacherSelect = null;

    function rebuildTeachers() {
      UI.clear(teacherWrap);
      teacherSelect = UI.select(
        teacherOptions(chosenSubject, day.id, period.id, isEdit ? lesson.id : null),
        chosenTeacher,
        {
          onchange: function (event) {
            chosenTeacher = event.target.value;
            resetConflict();
          }
        }
      );
      if (teacherSelect.value !== chosenTeacher) {
        chosenTeacher = '';
        teacherSelect.value = '';
      }
      teacherWrap.appendChild(teacherSelect);
    }
    rebuildTeachers();

    var noteInput = UI.textInput({
      value: isEdit ? lesson.note : '',
      placeholder: 'اختياري'
    });

    var handle = UI.modal({
      title: (isEdit ? 'تعديل الحصة' : 'إضافة حصة') + ' — ' + day.name + ' / ' + period.name,
      content: [
        alertSlot,
        UI.field('المادة', subjectSelect),
        UI.field('المدرس', teacherWrap),
        UI.field('ملاحظات', noteInput)
      ],
      actions: buildActions()
    });

    var primaryButton = handle.box.querySelector('.modal-foot .btn-primary');
    var primaryLabel = isEdit ? 'حفظ التعديل' : 'إضافة الحصة';

    function buildActions() {
      var actions = [
        {
          label: isEdit ? 'حفظ التعديل' : 'إضافة الحصة',
          variant: 'btn-primary',
          onClick: function () { return submit(); }
        },
        { label: 'إلغاء' }
      ];
      if (isEdit) {
        actions.push({
          label: 'حذف الحصة',
          variant: 'btn-ghost',
          onClick: function (close) {
            close();
            removeLesson(lesson);
          }
        });
      }
      return actions;
    }

    function resetConflict() {
      acknowledgedConflict = false;
      UI.clear(alertSlot);
      if (primaryButton) primaryButton.textContent = primaryLabel;
    }

    function showConflict(other) {
      UI.clear(alertSlot);
      alertSlot.appendChild(h('div', { class: 'alert alert-danger' }, [
        h('div', { text: 'يوجد تعارض' }),
        h('div', { text: conflictMessage(other) }),
        h('div', { text: 'اختر مدرسًا آخر، أو أضف الحصة رغم التعارض.' })
      ]));
      acknowledgedConflict = true;
      if (primaryButton) primaryButton.textContent = isEdit ? 'حفظ رغم التعارض' : 'إضافة رغم التعارض';
    }

    function submit() {
      if (!chosenSubject) {
        UI.toast('اختر المادة أولًا.', 'error');
        return true;
      }

      var draft = {
        id: isEdit ? lesson.id : null,
        classId: current.id,
        dayId: day.id,
        periodId: period.id,
        subjectId: chosenSubject,
        teacherId: chosenTeacher || null,
        note: Storage.cleanText(noteInput.value, 80)
      };

      var conflict = findTeacherConflict(draft);
      if (conflict && !acknowledgedConflict) {
        showConflict(conflict);
        return true;
      }

      if (isEdit) {
        lesson.subjectId = draft.subjectId;
        lesson.teacherId = draft.teacherId;
        lesson.note = draft.note;
      } else {
        draft.id = Storage.uid('les');
        state().lessons.push(draft);
      }

      Storage.commit();
      UI.toast(isEdit ? 'تم حفظ التعديل' : 'تم حفظ الحصة بنجاح', 'success');
      return false;
    }
  }

  function removeLesson(lesson) {
    UI.confirm({
      title: 'حذف الحصة',
      message: 'سيتم حذف هذه الحصة من الجدول.',
      confirmLabel: 'نعم، احذف',
      danger: true
    }).then(function (agreed) {
      if (!agreed) return;
      state().lessons = state().lessons.filter(function (item) { return item.id !== lesson.id; });
      Storage.commit();
      UI.toast('تم حذف الحصة', 'success');
    });
  }

  App.Schedule = {
    render: render,
    activeClass: activeClass,
    lessonAt: lessonAt,
    conflictCount: conflictCount,
    findTeacherConflict: findTeacherConflict
  };

})(window.App = window.App || {});
