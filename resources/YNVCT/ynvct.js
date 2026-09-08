/**
 * 云南交通职业技术学院 qzh5 -> 拾光课程表 v2
 * 
 * 安全说明：
 * - 不在仓库中保存任何学号、密码或 token。
 * - 当前 qzh5 登录接口使用 encode=1，因此需要输入抓包中 login 请求的加密 pwd。
 * - 后续确认前端明文密码加密算法后，可改成直接输入普通密码。
 */

const YNVCT = {
  loginUrl: "https://qzh5.ynvct.com/bzb_njwhd/login",
  curriculumUrl: "https://qzh5.ynvct.com/bzb_njwhd/student/curriculum",
  kbjcmsid: "F144CF7B11C446FAA4F813BCE82A79E3"
};

function validateUserNo(input) {
  const value = String(input == null ? "" : input).trim();
  if (!/^\\d{6,20}$/.test(value)) return "请输入正确的学号";
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

async function fetchCurriculum(token) {
  const url =
    YNVCT.curriculumUrl +
    "?week=&kbjcmsid=" +
    encodeURIComponent(YNVCT.kbjcmsid);

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
    throw new Error(json.Msg || json.msg || "课程表获取失败");
  }

  return json;
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

  const matches = String(raw).match(/\\d+/g) || [];
  let sections = matches
    .map(function (v) {
      let n = Number(v);

      // qzh5: 101/102 = 周一第1/2节，203/204 = 周二第3/4节
      if (n >= 100) n = n % 100;
      return n;
    })
    .filter(function (n) {
      return Number.isInteger(n) && n >= 1 && n <= 30;
    });

  sections = Array.from(new Set(sections)).sort(function (a, b) {
    return a - b;
  });

  if (!sections.length) return null;

  return {
    start: sections[0],
    end: sections[sections.length - 1]
  };
}

function expandRange(start, end, parity) {
  const result = [];
  for (let i = start; i <= end; i++) {
    if (parity === "odd" && i % 2 === 0) continue;
    if (parity === "even" && i % 2 !== 0) continue;
    result.push(i);
  }
  return result;
}

function parseWeekExpression(value) {
  let s = String(value == null ? "" : value).trim();
  if (!s) return [];

  s = s
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/[～~—–－]/g, "-")
    .replace(/至|到/g, "-")
    .replace(/\\s+/g, "");

  let parity = null;
  if (/\\(单\\)|单周/.test(s)) parity = "odd";
  if (/\\(双\\)|双周/.test(s)) parity = "even";

  s = s
    .replace(/\\(单\\)|\\(双\\)|单周|双周|周/g, "")
    .replace(/^,+|,+$/g, "");

  const result = [];

  s.split(",").forEach(function (part) {
    if (!part) return;

    const range = /^(\\d+)-(\\d+)$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      result.push.apply(result, expandRange(Math.min(start, end), Math.max(start, end), parity));
      return;
    }

    if (/^\\d+$/.test(part)) {
      const n = Number(part);
      if (parity === "odd" && n % 2 === 0) return;
      if (parity === "even" && n % 2 !== 0) return;
      result.push(n);
    }
  });

  return Array.from(new Set(result))
    .filter(function (n) {
      return Number.isInteger(n) && n >= 1 && n <= 60;
    })
    .sort(function (a, b) {
      return a - b;
    });
}

function parseWeeks(course) {
  const details = String(course.classWeekDetails || "").trim();

  if (details) {
    const weeks = (details.match(/\\d+/g) || [])
      .map(Number)
      .filter(function (n) {
        return Number.isInteger(n) && n >= 1 && n <= 60;
      });

    return Array.from(new Set(weeks)).sort(function (a, b) {
      return a - b;
    });
  }

  return parseWeekExpression(
    course.classWeek ||
    course.weeks ||
    course.week ||
    ""
  );
}

function isTime(value) {
  return /^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(value || ""));
}

function convertCourses(curriculumJson) {
  const rawCourses =
    curriculumJson &&
    curriculumJson.data &&
    curriculumJson.data[0] &&
    Array.isArray(curriculumJson.data[0].courses)
      ? curriculumJson.data[0].courses
      : [];

  return rawCourses
    .map(function (course) {
      const sections = parseSections(course);
      const weeks = parseWeeks(course);
      const day = normalizeDay(
        course.weekDay != null
          ? course.weekDay
          : (course.weekday != null ? course.weekday : course.day)
      );

      const startTime = course.startTime || "";
      const endTime = course.endTIme || course.endTime || "";
      const hasCustomTime = isTime(startTime) && isTime(endTime);

      if (!course.courseName || !sections || !weeks.length || !day) {
        console.warn("[YNVCT] 跳过无法解析的课程", course);
        return null;
      }

      return {
        name: String(course.courseName || "").trim(),
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
        weeks: weeks,
        isCustomTime: hasCustomTime,
        customStartTime: hasCustomTime ? startTime : null,
        customEndTime: hasCustomTime ? endTime : null
      };
    })
    .filter(Boolean);
}

function parseDateOnly(value) {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(value || ""));
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
  const root =
    curriculumJson &&
    curriculumJson.data &&
    curriculumJson.data[0]
      ? curriculumJson.data[0]
      : null;

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

  // 先算当前周周一，再回退到第1周周一。
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

async function saveToShiguang(curriculumJson) {
  const courses = convertCourses(curriculumJson);

  if (!courses.length) {
    throw new Error("没有解析到可导入的课程");
  }

  const config = buildCourseConfig(curriculumJson);

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
      "将通过 qzh5 移动教务接口登录并直接获取课程表。\n\n当前版本需要输入抓包得到的加密 pwd。",
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

    window.shiguangBridge.showToast("登录成功，正在获取课程表…");
    const curriculumJson = await fetchCurriculum(loginJson.data.token);

    const result = await saveToShiguang(curriculumJson);

    let message = "成功导入 " + result.courses.length + " 条课程";
    if (result.config && result.config.semesterStartDate) {
      message += "，开学日期 " + result.config.semesterStartDate;
    }

    window.shiguangBridge.showToast(message);
    window.shiguangBridge.notifyTaskCompletion();
  } catch (error) {
    console.error("[YNVCT]", error);
    window.shiguangBridge.showToast(
      "导入失败：" + (error && error.message ? error.message : String(error))
    );
  }
}

runYNVCTImport();
