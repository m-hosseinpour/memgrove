# راه‌اندازی و بهره‌برداری

> وضعیت این ماشین تا ۲۰۲۶-۱۱-۱۷. این سند می‌گوید انبار کجاست، چه ورودی‌هایی دارد،
> چطور به ایجنت‌ها وصل شده و چطور می‌شود بررسی‌اش کرد. طرح در [`design.md`](design.md)
> است و کار باز فعلی در مخزن نیست (قاعده‌اش در [`AGENTS.md`](../AGENTS.md)).

## انبار

- ریشه: `~/.agents/memgrove` (پیش‌فرض `DEFAULT_ROOT`)، قابل تغییر با `MEMGROVE_ROOT` یا `--root`.
  این مسیر در ۲۰۲۶-۱۱-۱۷ از `~/.agents/memory` منتقل شد و داده‌ها دست‌نخورده جابه‌جا شدند. روی
  ماشینی که انبار قدیمی دارد، به این ترتیب:
  1. نسخهٔ ۰.۴.۰ را نصب کنید (`uv tool install .` از چک‌اوت، یا نسخهٔ PyPI) و ایجنت‌ها را ببندید.
  2. مقصد را چک کنید: اگر `~/.agents/memgrove` وجود داشته باشد، `mv` انبار قدیمی را داخل آن
     می‌گذارد (`memgrove/memory`). اول مقصد را خالی یا جابه‌جا کنید، بعد
     `mv ~/.agents/memory ~/.agents/memgrove`.
  3. `memgrove protocol > ~/.agents/memgrove/PROTOCOL.md` و بعد
     `uv tool uninstall agent-memory`.
  ترتیب مهم است: پکیج قدیمی یا `mv` بدون بازکردن مقصد، یا انبار خالی قدیمی را از نو می‌سازد یا
  انبار تودرتو. حذف پکیج قدیمی هم کلاینتی را که هنوز `mem` را صدا می‌زند می‌شکند؛ اصلاح ثبت‌ها در
  بخش «اتصال ایجنت‌ها» آمده است.
- دو scope: `global/` برای یادداشت‌های همه‌جا، و `projects/<slug>/` برای هر دایرکتوری کاری.
  اسلاگ از مسیر مطلق ساخته می‌شود و هر نویسهٔ بیرون از `A-Za-z0-9._-` به `-` تبدیل می‌شود
  (پس `.` و `_` می‌مانند)؛ در ویندوز مسیر پیش از ساخت با `normcase` یکسان می‌شود
  (`C:/Users/u/proj` → `c--users-u-proj`).
- در هر scope یک `MEMORY.md` هست که **تولیدشده** است: هر نوشتن، حذف و `dream` آن را از روی
  فایل‌ها از نو می‌سازد. `memgrove index` نسخهٔ زندهٔ هر دو scope را چاپ می‌کند. ویرایش دستی
  `MEMORY.md` ماندگار نیست.
- فایل هر یادداشت: frontmatter با `name`، `description` و
  `metadata.{node_type,type,modified}`، سپس بدنه. یک یادداشت در هر فایل،
  نام فایل تخت و با پسوند `.md`؛ `MEMORY.md` (در هر بزرگی‌حروفی) نام مجاز نیست و `memgrove read`
  هم آن را نمی‌خواند (`memgrove index` جای آن است).

## مهاجرت از Claude Code

```bash
./bin/memgrove migrate --dry-run                 # پیش‌نمایش، بدون نوشتن
./bin/memgrove migrate                           # همهٔ پروژه‌ها، هرکدام در scope خودش
./bin/memgrove migrate --global user,feedback    # انتقال نوع‌های عمومی به global/
./bin/memgrove migrate --cwd "$PWD" --from /path/to/memory   # autoMemoryDirectory سفارشی
```

منبع پیش‌فرض `${CLAUDE_CONFIG_DIR:-~/.claude}/projects` است. `MEMORY.md` منبع کپی نمی‌شود
(تولیدشده است) و هر یادداشت از `store.write` رد می‌شود. scope از cwd واقعیِ ثبت‌شده در لاگ
سشن ساخته می‌شود، نه از نام پوشهٔ Claude Code (آن نام نقطه را به `-` تبدیل می‌کند و
برگشت‌پذیر نیست). فایل موجود بازنویسی نمی‌شود: یادداشت یکسان `exists` و متفاوت `collision`
است؛ یادداشتی که تثبیت قبلی زیر نام دیگری نگه داشته هم `exists` می‌شود، پس اجرای دوباره
انبار را تغییر نمی‌دهد. خروجی، فایل‌های ردشده (`refused`/`invalid`/`collision`) را تک‌به‌تک
نشان می‌دهد و تثبیت یک‌بار در پایان هر scope اجرا می‌شود.

## ورودی‌ها

| ورودی | اثر |
|---|---|
| `MEMGROVE_ROOT` | ریشهٔ انبار؛ برای تست یا انبار جایگزین. |
| `--root` | همان، فقط برای همان فرمان CLI (روی `MEMGROVE_ROOT` می‌نشیند). |
| `MEMGROVE_PROJECT_CWD` | فقط MCP: اگر درخواست `cwd` نداشته باشد، scope پروژه از این مسیر ساخته می‌شود. |
| `cwd` در درخواست MCP | بر `MEMGROVE_PROJECT_CWD` اولویت دارد. |
| `cwd`/`--cwd` در CLI | دایرکتوری پروژه برای همان فرمان؛ پیش‌فرض: دایرکتوری جاری. |

نام‌های قدیمی `MEM_ROOT` و `MEMORY_PROJECT_CWD` دیگر خوانده نمی‌شوند و fallback ندارند: اگر در
تنظیم کلاینتی مانده باشند، بی‌صدا نادیده گرفته می‌شوند و ابزار روی ریشهٔ پیش‌فرض کار می‌کند.

در MCP ترتیب این است: `cwd` صریح ← `MEMGROVE_PROJECT_CWD` ← دایرکتوری جاری سرور.

**هشدار:** سروری که برای چند پروژه یک‌جا اجرا می‌شود (مثل DSH) یک دایرکتوری جاری بی‌معنا
دارد. درخواست‌ها باید `cwd` صریح بفرستند، وگرنه یادداشت در scope پروژهٔ اشتباه می‌نشیند.

## نصب و به‌روزرسانی

کاربر عادی از PyPI نصب می‌کند؛ نه clone و نه ساختن:

```bash
uv tool install memgrove        # یا: pipx install memgrove
memgrove --version
uv tool upgrade memgrove        # به‌روزرسانی
```

روی این ماشین، برای کار روی خودِ کد، نصب از چک‌اوت است:

```bash
uv tool install .        # memgrove روی PATH
./bin/memgrove write ...      # همان کد، از داخل چک‌اوت، بدون نصب
```

ایجنت‌ها `memgrove` روی `PATH` را صدا می‌زنند، نه فایل داخل چک‌اوت. بعد از هر تغییر در کد:

```bash
uv tool install --reinstall .
```

وگرنه ایجنت‌ها کد قدیمی را اجرا می‌کنند و تست‌های داخل چک‌اوت ممکن است سبز باشند در حالی
که رفتار واقعی ایجنت چیز دیگری است.

## انتشار

نسخه یک‌جا زندگی می‌کند: `__version__` در `memgrove/__init__.py`. تگ `v<همان نسخه>` است و
workflow انتشار ([`release.yml`](../.github/workflows/release.yml)) با push همان تگ روی گیت‌هاب
اجرا می‌شود:

```bash
# پس از بامپ __version__ و سبز شدن تست‌ها
git add -A && git commit -m "Release X.Y.Z"
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z
```

ترتیب کارها در workflow:

1. تست‌ها روی لینوکس و ویندوز (همان `ci.yml`، به‌صورت reusable).
2. بررسی این‌که تگ با `memgrove.__version__` یکی است؛ نبودِ تطابق job را متوقف می‌کند.
3. `uv build`، نصب wheel در یک محیط تمیز، و اجرای `memgrove --version` و `memgrove protocol`.
4. انتشار روی PyPI با Trusted Publishing: بدون توکن ذخیره‌شده، با OIDC و environment `pypi`.
5. ساخت GitHub Release با wheel و sdist پیوست (`--generate-notes`).

**تنظیم یک‌بارهٔ PyPI، پیش از اولین ریلیز:** در
<https://pypi.org/manage/account/publishing/> یک «pending publisher» بسازید:

| فیلد | مقدار |
|---|---|
| PyPI Project Name | `memgrove` |
| Owner | `m-hosseinpour` |
| Repository name | `memgrove` |
| Workflow name | `release.yml` |
| Environment name | `pypi` |

نام `memgrove` تا ۲۰۲۶-۱۱-۱۷ روی PyPI آزاد بود (`/pypi/memgrove/json` → 404)؛ همان
pending publisher نام را رزرو می‌کند و بعد از اولین انتشار به trusted publisher عادی تبدیل
می‌شود. اگر روزی workflow یا environment تغییر کرد، همین رکورد را به‌روز کنید، نه اینکه توکن
دستی بسازید.

نام قبلی `agent-memory` را PyPI رد می‌کند: چکِ «too similar» اسم را با تابع `ultranormalize_name`
مقایسه می‌کند که `-`/`_`/`.` را حذف و `l|i` را `1` و `o` را `0` می‌کند، پس `agent-memory` و
`agentmemory` (پروژه‌ای موجود روی PyPI) هر دو به `agentmem0ry` می‌رسند. با همین قاعده
`agent_memory`، `agent.memory` و `agent-mem` هم مسدودند؛ تغییر نام به `memgrove` برای عبور از
همین چک بود، نه سلیقه.

**نام مخزن (انجام شد، ۲۰۲۶-۱۱-۱۷).** مخزن روی گیت‌هاب و گیت‌سرور خودمان به `memgrove` تغییر نام
داد، هر دو URL در `origin` به‌روز شد (گیت‌هاب لینک قدیمی را redirect می‌کند و گیت‌سرور خودمان ۳۰۱
می‌دهد) و فیلد Repository name در trusted publisher هم `memgrove` است. اگر روزی مخزن دوباره تغییر
نام داد، این فیلد و هر دو URL باید با هم عوض شوند، وگرنه OIDC با مخزنی که workflow در آن اجرا
می‌شود نمی‌خواند و انتشار رد می‌شود.

نکته‌ها:

- انتشار روی PyPI برگشت‌ناپذیر است: نام و شمارهٔ نسخهٔ منتشرشده پاک نمی‌شوند. برای تمرین از
  TestPyPI استفاده کنید، نه از یک شمارهٔ نسخهٔ واقعی.
- گیت‌هاب تنها جای اجرای workflow است. `origin` دو URL دارد (گیت‌سرور خودمان و گیت‌هاب)، پس
  همان `git push origin main` و `git push origin v<version>` هر دو مقصد را به‌روز می‌کند — به
  شرطی که تگ‌ها هم push شوند. اگر کامیت یا تگ برای اولین بار فایل `.github/workflows/` را روی
  گیت‌هاب می‌سازد، توکن باید scope `workflow` داشته باشد؛ وگرنه گیت‌هاب push را با
  `refusing to allow a Personal Access Token to create or update workflow ... without workflow
  scope` رد می‌کند و تگ اصلاً نمی‌رسد، پس هیچ ریلیزی اجرا نمی‌شود.
- اگر job پیش از آپلود شکست خورد، همان اجرا را از تب Actions دوباره اجرا کنید (rerun). اگر PyPI
  نسخه را گرفت و Release ساخته نشد، Release را دستی از همان artifact بسازید. PyPI نسخهٔ تکراری
  را با `400 File already exists` رد می‌کند، پس برای همان نسخه تگ را دوباره push نکنید.

## ویندوز

- نصب از PyPI همان `uv tool install memgrove` است و `memgrove.exe` روی `PATH` می‌آید؛
  `uv tool install .` فقط برای نصب از چک‌اوت است. `python -m memgrove` هم همان
  CLI است. `bin/memgrove` مخصوص bash است و `bin\memgrove.cmd` معادل ویندوزیِ بدون نصب.
- قفل scope در ویندوز روی یک بایت از `<scope>/.memgrove.lock` است، چون ویندوز هندل پوشه را قفل
  نمی‌کند. فایل state نیست: با مرگ پروسه آزاد می‌شود و `MEMORY.md` آن را نمی‌بیند.
- نوشتن همیشه LF است و خواندن CRLF و CR را هم می‌فهمد؛ `memory.md` در هر بزرگی‌حروفی همان
  `MEMORY.md` حساب می‌شود.
- CLI خروجی UTF-8 می‌دهد. در Windows PowerShell 5.1 برای متن غیر‌ASCII بهتر است
  `[Console]::OutputEncoding = [Text.Encoding]::UTF8` یک‌بار ست شود یا از PowerShell 7 استفاده
  شود.

## اتصال ایجنت‌ها

این جدول وضعیت فعلی است (۲۰۲۶-۱۱-۱۷): هر سه کلاینت روی `memgrove` ثبت شده‌اند و پکیج قدیمی
`agent-memory` (دستور `mem`) هم حذف شده است. روی ماشین دیگری که هنوز ثبت قدیمی دارد، ورودی را به
`"memgrove": { "command": "memgrove", "args": ["mcp"] }` تغییر دهید و
`uv tool uninstall agent-memory` اجرا کنید؛ وگرنه ایجنتی که `memgrove_index` را صدا بزند از سرور
قدیمی «unknown tool» می‌گیرد و allowlistهای Claude Code (مثل `mcp__mem__memory_write`) هم دیگر
نمی‌خوانند.

| ایجنت | محل | نکته |
|---|---|---|
| Claude Code | `~/.claude.json`، سرور `memgrove` در scope کاربر | علاوه بر آن `autoMemoryEnabled: false` در `~/.claude/settings.json`، تا حافظهٔ بومی Claude با این انبار هم‌زمان ننویسد. |
| opencode | `~/.config/opencode/opencode.json` | زیر `mcp.servers`. |
| DSH | `~/.dsh/cordis.patch.yml` | یک ردیف `@deepseek-ai/dsh-mcp-client` با `serverName: memgrove`. |

قالب دقیق این سه در README آمده است. بررسی:

```bash
claude mcp list                 # memgrove باید connected باشد
opencode mcp list               # همان؛ بعد از restart سرویس اول opencode debug config
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  | ./bin/memgrove mcp | python3 -m json.tool | head -40
```

هر سه کلاینت سرور را بدون env اجرا می‌کنند، پس هر سه همان `~/.agents/memgrove` را می‌بینند.
خواندن بین دو کلاینت در ۲۰۲۶-۱۰-۲۹ تأیید شد (هنوز با نام‌های قدیمی، پیش از تغییر نام به
`memgrove`): یادداشتی که از راه سرور روی یک انبار موقت نوشته شد، با `claude -p` (ابزار
`mcp__mem__memory_read`) و `opencode run` (ابزار `mem_memory_read`) هم خوانده شد.

`opencode mcp list` بلافاصله بعد از `opencode service restart` ممکن است «No MCP servers
configured» بگوید تا وقتی location بارگذاری شود؛ یک `opencode debug config` پیش از آن کافی است.

## بررسی سریع

```bash
export MEMGROVE_ROOT=$(mktemp -d)
export PROJ=$(mktemp -d)
./bin/memgrove write --scope project --cwd "$PROJ" --path a.md --name shared \
  --description "a note" --if-version new --content "body"
./bin/memgrove write --scope project --cwd "$PROJ" --path b.md --name shared \
  --description "a note" --if-version new --content "body"
ls "$MEMGROVE_ROOT"/projects/*/          # a.md رفته است: تثبیت همان لحظه اجرا شد
./bin/memgrove index --cwd "$PROJ"
./bin/memgrove read --scope project --cwd "$PROJ" --path b.md
rm -rf "$MEMGROVE_ROOT" "$PROJ"
```

در ویندوز همین بررسی با `memgrove` (یا `python -m memgrove`) و `$env:MEMGROVE_ROOT` / `$env:PROJ` انجام
می‌شود.

## محدودیت‌های شناخته‌شده

- ادغام فقط با «واژه‌های یکسان» در `description` رخ می‌دهد (Jaccard ≥ ۰٫۹۵ تا ۱۹ واژهٔ متمایز،
  که در این اندازه فقط با همان مجموعهٔ واژه به دست می‌آید)، نه با شباهت جزئی: افزودن یک قید
  کوتاه (`... tag blue`) یادداشت را حذف نمی‌کند و بازگویی با واژه‌های دیگر یادداشت جداگانه می‌ماند.
  توصیف با بیش از ۱۹ واژهٔ متمایز هرگز با شباهت ادغام نمی‌شود، پس دو یادداشت تکراری با توصیف
  بلند کنار هم می‌مانند؛ «تغییر نام + تناقض» هم تشخیص داده نمی‌شود.
- MCP ابزار حذف ندارد؛ حذف از راه CLI (`memgrove forget`) است.
- `memgrove read` فقط نام تخت `.md` می‌پذیرد؛ `..`، مسیر مطلق و `MEMORY.md` (در هر بزرگی‌حروفی)
  رد می‌شوند. بایت نامعتبر UTF-8 در فایل دست‌نویس با `U+FFFD` جایگزین می‌شود، نه تراک‌بک.
- `memgrove index` فقط چاپ می‌کند؛ فایل `MEMORY.md` فقط با نوشتن یا `dream` بازنویسی می‌شود.
- بدون تاریخچهٔ git و بدون استیت: حذف اشتباه فقط با بازنویسی دستی جبران می‌شود.
- انبار فقط روی همین ماشین است و خودش پشتیبان نمی‌گیرد: خرابی دیسک یعنی از دست رفتن حافظه. اگر
  پشتیبان می‌خواهید، بیرون از ابزار از `~/.agents/memgrove` کپی دوره‌ای بگیرید (تصمیمش در
  design §۱۱).
- یک سرور MCP برای چند پروژه باید در هر درخواست `cwd` بگیرد (بالا).
- `PROTOCOL.md` خودکار در ریشهٔ انبار ساخته نمی‌شود؛ کد فقط چاپش می‌کند:
  `memgrove protocol > ~/.agents/memgrove/PROTOCOL.md` (فایل داخل پکیج است، پس نسخهٔ نصب‌شده هم
  همان را دارد).
- فرانت‌متر فقط سه کلیدِ تحت مدیریت را نگه می‌دارد (`name`، `description`، `metadata`)؛ کلید
  دست‌نویس دیگری مثل `title` در اولین بازنویسی حذف می‌شود. عنوانِ ایندکس از `name` ساخته
  می‌شود.
- `name` و `description` باید یک‌خطی باشند: هر نویسهٔ خط‌شکن (newline، carriage return،
  U+2028 و مانند آن) پیش از نوشتن با خطای `invalid` رد می‌شود و نه فایلی ساخته می‌شود نه scope
  تازه‌ای. متن چندخطی جای‌اش بدنه است.

کار باز فعلی وجود ندارد؛ اگر کاری باز شود، طبق [`AGENTS.md`](../AGENTS.md) در `HANDOFF.md`
نوشته می‌شود.
