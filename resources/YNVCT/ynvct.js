/**
 * 云南交通职业技术学院 qzh5 -> 拾光课程表 v2
 *
 * 重要：
 * qzh5 的 curriculum 接口按 week 返回“该周快照”，不是整学期总课表。
 * 因此本适配器会遍历 1..maxWeek，再按课程块合并实际出现周次。
 */

const YNVCT = {
  loginUrl: "https://qzh5.ynvct.com/bzb_njwhd/login",
  curriculumUrl: "https://qzh5.ynvct.com/bzb_njwhd/student/curriculum",
  kbjcmsid: "F144CF7B11C446FAA4F813BCE82A79E3"
};

function validateUserNo(input) {
  const value = String(input == null ? "" : input).trim();
  if (!/^\d{6,20}$/.test(value)) return "请输入正确的学号";
  return false;
}

function validateEncryptedPwd(input) {
  const value = String(input == null ? "" : input).trim();
  if (!value) return "加密 pwd 不能为空";
  return false;
}

async function getCredentials() {
  const userNo = await window.shiguangBridgePromise.showPrompt(
    "学号",
    "请输入 qzh5 登录学号",
    "",
    "validateUserNo"
  );
  if (userNo === null) return null;

  const encryptedPwd = await window.shiguangBridgePromise.showPrompt(
    "加密 pwd",
    "请输入抓包中 /bzb_njwhd/login 请求里的 pwd 参数（不是明文密码）",
    "",
    "validateEncryptedPwd"
  );
  if (encryptedPwd === null) return null;

  return {
    userNo: String(userNo).trim(),
    encryptedPwd: String(encryptedPwd).trim()
  };
}

async function loginQzh5(userNo, encryptedPwd) {
  const body = new URLSearchParams();
  body.set("userNo", userNo);
  body.set("pwd", encryptedPwd);
  body.set("encode", "1");
  body.set("captchaData", "");
  body.set("codeVal", "");

  const response = await fetch(YNVCT.loginUrl, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    credentials: "include",
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error("登录接口 HTTP " + response.status);
  }

  const json = await response.json();

  if (
    String(json.code) !== "1" ||
    !json.data ||
    !json.data.token
  ) {
    throw new Error(json.Msg || json.msg || "qzh5 登录失败");
  }

  return json;
}

async function fetchCurriculumWeek(token, week) {
  const weekValue = week == null ? "" : String(week);
  const url =
    YNVCT.curriculumUrl +
    "?week=" + encodeURIComponent(weekValue) +
    "&kbjcmsid=" + encodeURIComponent(YNVCT.kbjcmsid);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "token": token
    },
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("课程表接口 HTTP " + response.status);
  }

  const json = await response.json();

  if (
    String(json.code) !== "1" ||
    !Array.isArray(json.data) ||
    !json.data[0]
  ) {
    throw new Error(json.Msg || json.msg || "课表获取失败");
  }

  return json;
}

function getFirstData(json) {
  return json && Array.isArray(json.data) && json.data[0]
    ? json.data[0]
    : null;
}

function getResponseWeek(json, fallbackWeek) {
  const root = getFirstData(json);
  if (!root) return fallbackWeek;

  const fromRoot = Number(root.week);
  if (Number.isInteger(fromRoot) && fromRoot > 0) {
    return fromRoot;
  }

  const top = Array.isArray(root.topInfo) && root.topInfo[0]
    ? root.topInfo[0]
    : null;
  const fromTop = Number(top && top.week);

  return Number.isInteger(fromTop) && fromTop > 0
    ? fromTop
    : fallbackWeek;
}

function getMaxWeek(json) {
  const root = getFirstData(json);
  const top = root && Array.isArray(root.topInfo) && root.topInfo[0]
    ? root.topInfo[0]
    : null;

  const value = Number(top && top.maxWeek);
  return Number.isInteger(value) && value > 0 && value <= 60
    ? value
    : 20;
}

function normalizeDay(value) {
  const s = String(value == null ? "" : value).trim();

  if (/^[1-7]$/.test(s)) return Number(s);
  if (s === "0") return 7;

  const map = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7,
    "周一": 1, "周二": 2, "周三": 3, "周四": 4, "周五": 5, "周六": 6, "周日": 7,
    "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4, "星期五": 5, "星期六": 6, "星期日": 7
  };

  return map[s] || 0;
}

function parseSections(course) {
  const raw =
    course.weekNoteDetail ||
    course.classTime ||
    course.sections ||
    "";

  const matches = String(raw).match(/\d+/g) || [];
  const sections = Array.from(new Set(
    matches
      .map(function (v) {
        let n = Number(v);
        if (n >= 100) n = n % 100;
        return n;
      })
      .filter(function (n) {
        return Number.isInteger(n) && n >= 1 && n <= 30;
      })
  )).sort(function (a, b) {
    return a - b;
  });

  if (!sections.length) return null;

  return {
    start: sections[0],
    end: sections[sections.length - 1]
  };
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function normalizeCourseForWeek(course, week) {
  const sections = parseSections(course);
  const day = normalizeDay(
    course.weekDay != null
      ? course.weekDay
      : (course.weekday != null ? course.weekday : course.day)
  );

  const name = String(course.courseName || course.name || "").trim();
  if (!name || !sections || !day || !Number.isInteger(week) || week < 1) {
    return null;
  }

  const startTime = String(course.startTime || "");
  const endTime = String(course.endTIme || course.endTime || "");
  const hasCustomTime = isTime(startTime) && isTime(endTime);

  return {
    name: name,
    teacher: String(course.teacherName || course.teacher || "").trim(),
    position: String(
      course.classroomName ||
      course.location ||
      course.position ||
      ""
    ).trim(),
    day: day,
    startSection: sections.start,
    endSection: sections.end,
    weeks: [week],
    isCustomTime: hasCustomTime,
    customStartTime: hasCustomTime ? startTime : null,
    customEndTime: hasCustomTime ? endTime : null
  };
}

function courseIdentity(course) {
  return [
    course.name,
    course.teacher,
    course.position,
    course.day,
    course.startSection,
    course.endSection,
    course.isCustomTime ? "1" : "0",
    course.customStartTime || "",
    course.customEndTime || ""
  ].join("\u001f");
}

function mergeWeekIntoMap(map, course) {
  const key = courseIdentity(course);
  const existing = map.get(key);

  if (!existing) {
    map.set(key, course);
    return;
  }

  const weeks = Array.from(new Set(
    existing.weeks.concat(course.weeks)
  )).sort(function (a, b) {
    return a - b;
  });

  existing.weeks = weeks;
}

async function fetchSemesterCurriculum(token) {
  const metadata = await fetchCurriculumWeek(token, null);
  const maxWeek = getMaxWeek(metadata);
  const courseMap = new Map();

  window.shiguangBridge.showToast(
    "正在获取整学期课表，共 " + maxWeek + " 周…"
  );

  const batchSize = 4;

  for (let start = 1; start <= maxWeek; start += batchSize) {
    const weeks = [];
    for (let week = start; week < start + batchSize && week <= maxWeek; week++) {
      weeks.push(week);
    }

    const responses = await Promise.all(
      weeks.map(function (week) {
        return fetchCurriculumWeek(token, week).then(function (json) {
          return { requestedWeek: week, json: json };
        });
      })
    );

    responses.forEach(function (entry) {
      const actualWeek = getResponseWeek(entry.json, entry.requestedWeek);

      if (actualWeek !== entry.requestedWeek) {
        throw new Error(
          "请求第 " + entry.requestedWeek +
          " 周，但接口返回第 " + actualWeek + " 周"
        );
      }

      const root = getFirstData(entry.json);
      const rawCourses = root && Array.isArray(root.courses)
        ? root.courses
        : [];

      rawCourses.forEach(function (rawCourse) {
        const course = normalizeCourseForWeek(rawCourse, actualWeek);
        if (course) mergeWeekIntoMap(courseMap, course);
      });
    });

    const done = Math.min(start + batchSize - 1, maxWeek);
    window.shiguangBridge.showToast(
      "整学期课表读取中：" + done + "/" + maxWeek + " 周"
    );
  }

  const courses = Array.from(courseMap.values()).sort(function (a, b) {
    return (
      a.day - b.day ||
      a.startSection - b.startSection ||
      a.name.localeCompare(b.name)
    );
  });

  return {
    metadata: metadata,
    courses: courses,
    maxWeek: maxWeek
  };
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;

  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ));
}

function formatDateOnly(date) {
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getUTCDate()).padStart(2, "0")
  );
}

function buildCourseConfig(curriculumJson) {
  const root = getFirstData(curriculumJson);
  if (!root) return null;

  const top =
    Array.isArray(root.topInfo) && root.topInfo.length
      ? root.topInfo[0]
      : null;

  if (!top) return null;

  const currentWeek = Number(top.week || root.week);
  const maxWeek = Number(top.maxWeek);
  const today = parseDateOnly(top.today);

  if (!today || !Number.isInteger(currentWeek) || currentWeek < 1) {
    return null;
  }

  const jsDay = today.getUTCDay();
  const daysFromMonday = jsDay === 0 ? 6 : jsDay - 1;

  const currentMonday = new Date(
    today.getTime() - daysFromMonday * 86400000
  );

  const semesterStart = new Date(
    currentMonday.getTime() -
    (currentWeek - 1) * 7 * 86400000
  );

  const result = {
    semesterStartDate: formatDateOnly(semesterStart),
    firstDayOfWeek: 1
  };

  if (Number.isInteger(maxWeek) && maxWeek > 0) {
    result.semesterTotalWeeks = maxWeek;
  }

  return result;
}

async function saveToShiguang(semester) {
  const courses = semester.courses || [];

  if (!courses.length) {
    throw new Error("没有解析到可导入的课程");
  }

  const config = buildCourseConfig(semester.metadata);

  if (config) {
    await window.shiguangBridgePromise.saveCourseConfig(
      JSON.stringify(config)
    );
  }

  const saved = await window.shiguangBridgePromise.saveImportedCourses(
    JSON.stringify(courses)
  );

  if (saved !== true) {
    throw new Error("拾光返回课程保存失败");
  }

  return {
    courses: courses,
    config: config
  };
}

async function runYNVCTImport() {
  try {
    const confirmed = await window.shiguangBridgePromise.showAlert(
      "云南交通职业技术学院",
      "将按周读取 qzh5 整学期课程，避免遗漏后续周新增课程。\n\n当前版本需要输入抓包得到的加密 pwd。",
      "开始导入"
    );

    if (!confirmed) return;

    const credentials = await getCredentials();
    if (!credentials) return;

    window.shiguangBridge.showToast("正在登录 qzh5…");
    const loginJson = await loginQzh5(
      credentials.userNo,
      credentials.encryptedPwd
    );

    const semester = await fetchSemesterCurriculum(
      loginJson.data.token
    );

    const result = await saveToShiguang(semester);

    let autoSyncEnabled = false;
    if (
      window.Qzh5SyncBridge &&
      typeof window.Qzh5SyncBridge.enableAutoSync === "function"
    ) {
      const targetTableId =
        typeof window.currentTableId === "string"
          ? window.currentTableId
          : "";

      autoSyncEnabled = window.Qzh5SyncBridge.enableAutoSync(
        credentials.userNo,
        credentials.encryptedPwd,
        targetTableId
      ) === true;
    }

    let message =
      "成功导入 " + result.courses.length +
      " 个课程块，已覆盖 " + semester.maxWeek + " 周";

    if (result.config && result.config.semesterStartDate) {
      message += "，开学日期 " + result.config.semesterStartDate;
    }

    if (autoSyncEnabled) {
      message += "，自动同步已开启";
    }

    window.shiguangBridge.showToast(message);
    window.shiguangBridge.notifyTaskCompletion();
  } catch (error) {
    console.error("[YNVCT]", error);
    window.shiguangBridge.showToast(
      "导入失败：" +
      (error && error.message ? error.message : String(error))
    );
  }
}

runYNVCTImport();
