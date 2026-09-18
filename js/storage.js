/* storage.js — الحالة، القراءة والحفظ في localStorage، التحقق من صحة البيانات */
(function (App) {
  'use strict';

  var STORAGE_KEY = 'madrasa-schedule:v1';
  var DATA_VERSION = 1;
  var SAVE_DELAY_MS = 200;

  var DAY_DEFS = [
    { key: 'sat', name: 'السبت', active: true },
    { key: 'sun', name: 'الأحد', active: true },
    { key: 'mon', name: 'الإثنين', active: true },
    { key: 'tue', name: 'الثلاثاء', active: true },
    { key: 'wed', name: 'الأربعاء', active: true },
    { key: 'thu', name: 'الخميس', active: false },
    { key: 'fri', name: 'الجمعة', active: false }
  ];

  var ORDINALS = [
    'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة',
    'السابعة', 'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة'
  ];

  var DEFAULT_PERIOD_COUNT = 6;
  var MIN_PERIOD_COUNT = 1;
  var MAX_PERIOD_COUNT = 12;

  var SUBJECT_COLORS = [
    '#dbe9f7', '#dceee2', '#fae4d2', '#e6dff5',
    '#f8dcda', '#d8ecec', '#f0e8cf', '#e4e7eb'
  ];

  var state = null;
  var saveTimer = null;

  function uid(prefix) {
    return prefix + '-' +
      Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 8);
  }

  function periodName(index) {
    return 'الحصة ' + (ORDINALS[index] || String(index + 1));
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !isArray(value);
  }

  function cleanText(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength || 120);
  }

  function createDefaultState() {
    return {
      version: DATA_VERSION,
      school: { name: '', academicYear: '', stage: '', notes: '' },
      days: DAY_DEFS.map(function (day) {
        return { id: uid('day'), key: day.key, name: day.name, active: day.active };
      }),
      periods: buildPeriods(DEFAULT_PERIOD_COUNT),
      classes: [],
      subjects: [],
      teachers: [],
      lessons: [],
      prefs: { setupStarted: false, activeClassId: null }
    };
  }

  function buildPeriods(count) {
    var periods = [];
    for (var i = 0; i < count; i++) {
      periods.push({ id: uid('per'), name: periodName(i), start: '', end: '' });
    }
    return periods;
  }

  /* يعيد بناء أي بيانات ناقصة أو تالفة حتى لا ينهار التطبيق */
  function normalize(raw) {
    var base = createDefaultState();
    if (!isObject(raw)) return base;

    var result = base;

    if (isObject(raw.school)) {
      result.school = {
        name: cleanText(raw.school.name),
        academicYear: cleanText(raw.school.academicYear, 40),
        stage: cleanText(raw.school.stage),
        notes: cleanText(raw.school.notes, 400)
      };
    }

    if (isArray(raw.days) && raw.days.length) {
      var days = [];
      DAY_DEFS.forEach(function (def) {
        var found = raw.days.filter(function (day) {
          return isObject(day) && (day.key === def.key || day.name === def.name);
        })[0];
        days.push({
          id: (found && typeof found.id === 'string') ? found.id : uid('day'),
          key: def.key,
          name: def.name,
          active: found ? found.active !== false : def.active
        });
      });
      result.days = days;
    }

    if (isArray(raw.periods) && raw.periods.length) {
      result.periods = raw.periods.slice(0, MAX_PERIOD_COUNT)
        .filter(isObject)
        .map(function (period, index) {
          return {
            id: typeof period.id === 'string' ? period.id : uid('per'),
            name: cleanText(period.name, 60) || periodName(index),
            start: cleanText(period.start, 5),
            end: cleanText(period.end, 5)
          };
        });
      if (!result.periods.length) result.periods = buildPeriods(DEFAULT_PERIOD_COUNT);
    }

    // نربط الحقول الإضافية بالمعرّف وليس بالترتيب، لأن العناصر التالفة تُحذف أثناء التنظيف
    function sourceOf(list, id) {
      if (!isArray(list)) return null;
      for (var i = 0; i < list.length; i++) {
        if (isObject(list[i]) && list[i].id === id) return list[i];
      }
      return null;
    }

    result.classes = normalizeNamedList(raw.classes, 'cls');

    result.subjects = normalizeNamedList(raw.subjects, 'sub').map(function (subject) {
      var source = sourceOf(raw.subjects, subject.id);
      subject.color = (source && typeof source.color === 'string') ? source.color : '';
      return subject;
    });

    result.teachers = normalizeNamedList(raw.teachers, 'tch').map(function (teacher) {
      var source = sourceOf(raw.teachers, teacher.id);
      var ids = (source && isArray(source.subjectIds)) ? source.subjectIds : [];
      teacher.subjectIds = ids.filter(function (id) { return typeof id === 'string'; });
      return teacher;
    });

    result.lessons = normalizeLessons(raw.lessons, result);

    if (isObject(raw.prefs)) {
      result.prefs = {
        setupStarted: raw.prefs.setupStarted === true,
        activeClassId: typeof raw.prefs.activeClassId === 'string' ? raw.prefs.activeClassId : null
      };
    }

    // نعتبر الإعداد قد بدأ إذا كانت هناك بيانات فعلية
    if (result.school.name || result.classes.length || result.subjects.length || result.teachers.length) {
      result.prefs.setupStarted = true;
    }

    return result;
  }

  function normalizeNamedList(list, prefix) {
    if (!isArray(list)) return [];
    var seen = {};
    var output = [];
    list.forEach(function (item) {
      if (!isObject(item)) return;
      var name = cleanText(item.name);
      if (!name) return;
      var id = typeof item.id === 'string' && !seen[item.id] ? item.id : uid(prefix);
      seen[id] = true;
      output.push({ id: id, name: name });
    });
    return output;
  }

  function normalizeLessons(list, scope) {
    if (!isArray(list)) return [];
    var valid = function (collection, id) {
      return collection.some(function (item) { return item.id === id; });
    };
    var taken = {};
    var output = [];
    list.forEach(function (lesson) {
      if (!isObject(lesson)) return;
      if (!valid(scope.classes, lesson.classId)) return;
      if (!valid(scope.days, lesson.dayId)) return;
      if (!valid(scope.periods, lesson.periodId)) return;
      if (!valid(scope.subjects, lesson.subjectId)) return;

      var slotKey = lesson.classId + '|' + lesson.dayId + '|' + lesson.periodId;
      if (taken[slotKey]) return;
      taken[slotKey] = true;

      output.push({
        id: typeof lesson.id === 'string' ? lesson.id : uid('les'),
        classId: lesson.classId,
        dayId: lesson.dayId,
        periodId: lesson.periodId,
        subjectId: lesson.subjectId,
        teacherId: valid(scope.teachers, lesson.teacherId) ? lesson.teacherId : null,
        note: cleanText(lesson.note, 80)
      });
    });
    return output;
  }

  function load() {
    var raw = null;
    try {
      var text = window.localStorage.getItem(STORAGE_KEY);
      raw = text ? JSON.parse(text) : null;
    } catch (error) {
      raw = null;
    }
    state = normalize(raw);
    return state;
  }

  function writeNow() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      document.dispatchEvent(new CustomEvent('app:saved'));
      return true;
    } catch (error) {
      document.dispatchEvent(new CustomEvent('app:save-failed'));
      return false;
    }
  }

  /* حفظ تلقائي مؤجل قليلًا حتى لا نكتب مع كل ضغطة حرف */
  function save() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      writeNow();
    }, SAVE_DELAY_MS);
  }

  /* أي تعديل على البيانات يمر من هنا: حفظ + إعادة رسم */
  function commit() {
    save();
    document.dispatchEvent(new CustomEvent('app:changed'));
  }

  function replaceState(raw) {
    state = normalize(raw);
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeNow();
    document.dispatchEvent(new CustomEvent('app:changed'));
  }

  function reset() {
    replaceState(null);
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function activeDays() {
    return state.days.filter(function (day) { return day.active; });
  }

  App.Storage = {
    STORAGE_KEY: STORAGE_KEY,
    DATA_VERSION: DATA_VERSION,
    SUBJECT_COLORS: SUBJECT_COLORS,
    MIN_PERIOD_COUNT: MIN_PERIOD_COUNT,
    MAX_PERIOD_COUNT: MAX_PERIOD_COUNT,
    load: load,
    save: save,
    commit: commit,
    replaceState: replaceState,
    reset: reset,
    normalize: normalize,
    createDefaultState: createDefaultState,
    getState: function () { return state; },
    uid: uid,
    periodName: periodName,
    byId: byId,
    activeDays: activeDays,
    isObject: isObject,
    isArray: isArray,
    cleanText: cleanText
  };

})(window.App = window.App || {});
