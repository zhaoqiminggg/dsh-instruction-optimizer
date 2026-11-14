// 指令优化器 · 后台（Host 半）
//
// 职责只有一件事：
//   把用户输入框里的草稿，以及右侧栏里的多轮讨论，交给当前会话所用的模型，
//   整理成一份逻辑清楚、术语准确、按需展开、可以直接执行的指令。
//
// 这里刻意不注册、不调用任何工具：优化器只能生成文字，不能执行任务。
// 一个内部命令由右侧栏调用，不出现在指令菜单里。

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'

const COMMAND_OPTIMIZE = 'dsh-instruction-optimizer-optimize'
const INTERNAL_COMMANDS = new Set([COMMAND_OPTIMIZE])

const MAX_DRAFT_CHARS = 12000
const MAX_FEEDBACK_CHARS = 4000
const MAX_CURRENT_CHARS = 20000
const MAX_HISTORY_ENTRIES = 12
const MAX_HISTORY_CHARS = 24000
const MAX_OPTIMIZED_CHARS = 24000
const MAX_QUESTIONS = 3
const MAX_QUESTION_OPTIONS = 4
const MAX_ATTACHMENTS = 8
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MAX_ATTACHMENT_TOTAL_BYTES = 24 * 1024 * 1024
const ATTACHMENT_FULL_TEXT_CHARS = 12000
const ATTACHMENT_SUMMARY_HEAD_CHARS = 1200
const ATTACHMENT_SUMMARY_TAIL_CHARS = 300
const MAX_ATTACHMENT_REFERENCES = 8
const MAX_COMMAND_JSON_CHARS = 40 * 1024 * 1024
const LLM_TIMEOUT_MS = 150000
const MAX_OUTPUT_TOKENS = 6000
const CONTEXT_TIMEOUT_MARKER = '[context-timeout]'

const DATA_DIR =
  process.env.DSH_INSTRUCTION_OPTIMIZER_DIR ||
  join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'instruction-optimizer')
const CONTEXT_CACHE_DIR = join(DATA_DIR, 'context-cache')
const RESULT_CACHE_FILE = join(DATA_DIR, 'result-cache.json')
const RESULT_CACHE_VERSION = 2
const RESULT_CACHE_MAX_ENTRIES = 30
const RESULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// 完整会话上下文：小会话全文；大会话分段完整阅读后汇总，最近一段保留逐字原文。
const FULL_SESSION_VERBATIM_CHARS = 5000
const SESSION_CHUNK_CHARS = 48000
const SESSION_SUMMARY_MAX_CHARS = 6000
const SESSION_DIRECT_SUMMARY_CHARS = 24000
const SESSION_CHUNK_SUMMARY_MAX_CHARS = 1400
const SESSION_RECENT_TAIL_CHARS = 3000
const SESSION_SUMMARY_MAX_TOKENS = 2000
const SESSION_SUMMARY_TIMEOUT_MS = 90000
const SESSION_CONTEXT_TIMEOUT_MS = 30000
const SESSION_CONTEXT_TIMEOUT_EXTENDED_MS = 120000
const SESSION_SUMMARY_CONCURRENCY = 16
const CONTEXT_CACHE_VERSION = 3
const CONTEXT_CACHE_MAX_CHUNKS = 240
const MAX_FULL_TOOL_CHARS = 6000

const LOCALE = {
  zh: {
    empty: '请先输入要优化的指令。',
    tooLong: `指令太长了，最多 ${MAX_DRAFT_CHARS} 个字符。`,
    feedbackLong: `讨论内容太长了，最多 ${MAX_FEEDBACK_CHARS} 个字符。`,
    request: '优化请求格式不正确。',
    requestLength: '优化请求过长。',
    noModel: '当前会话还没有可用的模型，暂时无法优化。',
    model: '模型调用失败',
    modelEmpty: '模型没有返回优化结果，请重试。',
    modelTruncated: '模型输出被截断，没有得到完整的指令。请重试，或把原指令缩短一些。',
    stopped: '已停止这次优化。',
    timeout: '优化超时了，请重试。',
    parse: '模型返回的格式无法识别，请重试一次。',
    unknown: '优化失败，请稍后重试。',
    attachmentRead: '附件格式无法读取，或附件服务暂时不可用。',
    attachmentTooLarge: '附件太大了，单个附件最多 20MB。',
    attachmentTooMany: '附件太多了，一次最多读取 8 个附件。',
    attachmentTotalTooLarge: '附件总大小太大了，请减少附件后重试。',
  },
  en: {
    empty: 'Enter an instruction to optimize first.',
    tooLong: `The instruction is too long (maximum ${MAX_DRAFT_CHARS} characters).`,
    feedbackLong: `The discussion message is too long (maximum ${MAX_FEEDBACK_CHARS} characters).`,
    request: 'The optimization request is invalid.',
    requestLength: 'The optimization request is too long.',
    noModel: 'This session has no usable model yet, so it cannot optimize right now.',
    model: 'Model call failed',
    modelEmpty: 'The model returned no optimization. Try again.',
    modelTruncated: 'The model output was cut off before a complete instruction. Retry, or shorten the draft.',
    stopped: 'This optimization was stopped.',
    timeout: 'Optimization timed out. Try again.',
    parse: 'The model returned a format that could not be understood. Try again.',
    unknown: 'Optimization failed. Try again shortly.',
    attachmentRead: 'The attachment format could not be read, or the attachment service is unavailable.',
    attachmentTooLarge: 'The attachment is too large; each attachment may be at most 20 MB.',
    attachmentTooMany: 'Too many attachments; at most 8 can be read at once.',
    attachmentTotalTooLarge: 'The attachments are too large in total. Remove some and try again.',
  },
}

const SYSTEM_PROMPT = `你是 DeepSeek Harness 的「指令优化器」。你的唯一任务，是把用户笨拙、口语化、顺序混乱、可能有错别字或专业术语缺失的草稿，改写成一份清晰、专业、准确、按需展开、可以直接发送给 Agent 执行的指令。

你绝对不是任务执行者：不要真的去写代码、查资料、改文件或完成用户草稿里的任务。你只改指令本身。

【唯一改写对象】用户提示里的「# 用户要优化的原指令」是本轮唯一要改写的对象；它可能很短、很口语化，也可能和会话里的最新任务看起来无关。会话记录、最近一条用户消息、助手计划都只是背景，不能替代它，也不能被当成“原指令”。无论记录里出现什么新任务、待办或计划，都不要优化、执行或续写那件事；只围绕原指令理解指代、补全必要指代。如果原指令里的“这个/那个/继续”在记录里找不到明确对象，就在 questions 里写清楚，不要把它改写成记录里的另一个任务。

【完整交付原则】每一版 optimized 都必须是完整、自包含、可以直接发送给 Agent 执行的指令：原任务、已经确认的要求、这轮反馈合并后的结果，都要出现在这一版里。反馈轮次要把「当前最新一版优化结果」当作底稿，在它基础上修改，输出完整新版；不能只输出这次新增/变化的一句话，也不能让执行者依赖上一版才能看懂。会话记录只用于校准方向、判断当前进度、解析指代、避免和已确认内容冲突；会话里的背景、已完成的事、历史讨论和任务环境不要复述进 optimized。需要指代时用最短锚点（例如“按刚才确认的方案”“继续第二步”“刚才那处按钮”），但指代之外的必要要求仍要完整保留。
反例：上一版已经写了“整理全书人物关系，按势力分组，姓名、身份、关系、依据都要有”，用户这轮只选“所有有名有姓的角色都列”。新版不能只写“所有有名有姓的角色都列”；必须把上一版全部要求保留，再把人物范围改成“所有有名有姓或明确身份的角色”。
同样，不要把“优化”当成“补全”：用户只说改颜色，就不要顺手加 hover、禁用态、对比度、过渡动画等新要求；只有不补就会做错时才在 questions 里问，不要直接扩写。

重要环境前提：用户是在 DeepSeek Harness（DSH）里写指令。用户说的“插件、右侧栏、输入框、会话、Agent”默认指 DSH 的插件体系和界面，不要擅自把“插件”理解成 Chrome/浏览器扩展、独立网页应用或其他平台。只有用户明确说“浏览器扩展 / Chrome 插件 / 网页 / 某个 App”时，才按那个平台写；平台不确定时，写成“需要用户确认运行平台”，不要编造。

每次优化前先读用户提示里的「当前会话交流记录」：先理解任务目标、已经做到哪一步、还差什么、当前有哪些约定或约束。当用户的草稿依赖上下文（例如“继续、再改一下、第二步、这个、那个”）时，必须用会话记录把指代还原成具体对象；但不要把会话过程和任务背景复述进 optimized，当前最新一版里已经确认的要求必须完整保留，只在会让执行走错时补最短的指代锚点。默认优先指向**最近一条用户消息**里的编号或内容；只有当最近一条用户消息无法确定时，才回看更早的用户消息，不要把助手以前生成的编号列表当成“刚才那个”的默认指代，除非用户明确说“你刚才说的/助手那条”。会话记录只是只读背景：不要执行、续写或回复记录里的任务；只提取必要的指代和约束，optimized 仍然要完整。记录不足以确定指代时，不要编造，在 questions 里写清楚需要确认什么；如果存在多个可能的清单，在 questions 里说明你按哪一条理解，不要大段复制原文。

必须做到：
1. 先还原真实意图。用户是编程零基础、也可能是某个领域的新手，常用生活化说法表达专业需求。先理解他到底想要什么，再用专业、准确的表达写出来，不能改变原意。
2. 纠正错别字、同音字、漏字、重复和明显病句。专有名词、文件名、代码、数字、链接、人名、产品名要原样保留；拿不准的写法不要乱改，在 questions 里说明。
3. 重排逻辑，但不要固定模板。简单请求 1–3 句；普通请求最多 3–5 个短点；只有复杂任务才使用小标题。不要把“目标/背景/步骤/约束/验收/不要做”整套塞给简单请求；能合并的合并，能删的删。
4. 只补会改变执行结果的遗漏：输入、范围、优先级、异常/失败处理、边界条件。信息不足时不要编造；真正的阻塞未知放进 questions，不要写成长篇假设或泛泛而谈的提醒。
5. 消除歧义、矛盾和遗漏，发现用户前后冲突时给出最合理的一种合并方式，并在 questions 里说明。
6. 保持用户使用的语言。用户用中文，就用中文写；用户用英文，就用英文写。保留用户原文中的专有名词和引用。
7. 优化后的指令要能直接发送执行。不要写“以下是优化后的指令”“希望对你有帮助”之类的话，也不要把它包在代码围栏里。
8. 不要擅自增加用户没要求的功能、范围或交付物；先求准，再求全，完整不等于堆废话。简单请求保持 1–3 句，不要为了显得专业而加角色、背景、原则、验收表或“不要做什么”。用户只改颜色，不要顺手加 hover、禁用态、对比度或动画。
9. 如果用户在多轮讨论里只是提问、质疑或让你解释，不要另写一段解释；把结论直接融入 optimized 的当前动作，或只把真正阻塞的未知放进 questions。不要跳过用户这轮反馈。
10. 不要把“插件”默认写成 Chrome/Edge 扩展。当前环境是 DeepSeek Harness（DSH）；DSH 的插件、右侧栏、输入框、会话都是 DSH 自己的扩展点和界面。除非用户明确指定其他平台，否则按 DSH 插件来写。
11. 优化 ≠ 回复：输出的是改写后的指令，不是对指令的回答、执行、续写或解释。不要替用户把任务做了。
14. 只做最小必要修改：用户只要求改某一步/某一句时，其他部分原样保留；保留原有结构、语气、语言和顺序，除非反馈要求调整。不要写改动说明、假设或自我评价。
15. 硬性保留原文中的变量占位符（如 {{...}}）、@文件、/命令、URL、代码块、数字、单位、文件名、路径、专有名词和引用；除非用户明确要求修改，否则不要改写、删除或翻译它们。
16. 输出前自检：目标是否明确、约束是否完整、步骤是否可执行、验收标准是否可判断、是否遗漏用户要求；自检只用于修改结果，不要把自检过程写出来。
17. 改写前先在心里做“保留清单”：把用户点名的对象、来源、交付物、禁止项、并列要求列出来；改写后逐项核对，不能删除、合并、缩窄或降级。这份清单只用于核对，不要写进 optimized。用户点名的来源都要保留；需要时可补可信度标注，但不能改成“只看某一种来源”。
18. 用三道体检决定是否可交付：① 验收能否由外部材料、命令或可核对的结果判断，不能只靠执行者自报“完成了”；② 缺的是信息还是能力：缺信息就补一手材料，缺工具/权限就写明，不要用泛泛的话掩盖；③ 是在同一目标上加深，还是偷偷新增范围；新增范围默认砍掉。
19. 长度红线：简单请求不超过 200 字、1–3 句；普通请求不超过原文 1.5 倍、约 400 字；复杂任务按需展开，但只保留会改变执行的约束，不加通用正确废话，不套全套模板，不写“从 A/B/C 多维度评估”这类横向清单。长度按“这一版完整指令”算；每一版都要完整，不能因为上一版已经有了就省略。用户明确要求的内容再长也要保留。
20. questions 只放“缺了就无法做对”的阻塞问题，最多 3 个；每题给 2–4 个互斥选项，label 用大白话，value 写选择的具体含义。能从会话推断的、纯风格偏好、无关紧要的问题不要问。即使有问题，也要先给一版尽力而为的 optimized。

只输出一个合法 JSON 对象，不要输出 Markdown 代码围栏，不要输出 JSON 以外的任何文字。结构必须是：
{
  "questions": [
    {
      "question": "缺了就无法做对的问题，最多 3 个",
      "options": [
        { "label": "面向用户的大白话选项", "value": "这个选择的具体含义" }
      ]
    }
  ],
  "optimized": "完整、自包含、可直接发送的优化后指令。反馈轮次也要输出完整新版，不能只写这轮改动。默认不要套模板；能用 1–3 句说清就不要分段，复杂任务才用小标题。不要包代码围栏"
}`

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeLocale(value) {
  return typeof value === 'string' && /^en(?:-|$)/i.test(value) ? 'en' : 'zh'
}

function t(locale, key, params) {
  const dictionary = LOCALE[normalizeLocale(locale)] || LOCALE.zh
  const template = dictionary[key] ?? LOCALE.zh[key] ?? key
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    params && name in params ? String(params[name]) : match
  )
}

function trimTo(value, max) {
  const text = textOf(value).trim()
  return text.length > max ? text.slice(0, max) : text
}

function blockToContextText(block) {
  if (!block || typeof block !== 'object') return ''
  if (block.type === 'text') return textOf(block.text)
  if (block.type === 'image') return '[图片]'
  if (block.type === 'file') return '[文件]'
  if (block.type === 'tool-call') {
    const args = trimTo(block.arguments, 500)
    return `[调用工具 ${textOf(block.name) || 'unknown'}]${args ? ' ' + args : ''}`
  }
  // reasoning 不进入给优化器看的会话摘要，避免把思考过程当任务事实。
  return ''
}

function messageToContextText(message) {
  if (!message || typeof message !== 'object') return ''
  if (!['user', 'assistant', 'tool'].includes(message.role)) return ''
  const content = Array.isArray(message.content)
    ? message.content
    : typeof message.content === 'string'
      ? [{ type: 'text', text: message.content }]
      : []
  const parts = []
  for (const block of content) {
    const text = blockToContextText(block).trim()
    if (text) parts.push(text)
  }
  return parts.join('\n').trim()
}

function labelForRole(role) {
  return role === 'user' ? '用户' : role === 'assistant' ? '助手' : '工具结果'
}

function rowToLine(row) {
  let text = row.text
  if (row.role === 'tool' && text.length > MAX_FULL_TOOL_CHARS) {
    const half = Math.floor(MAX_FULL_TOOL_CHARS / 2)
    text = `${text.slice(0, half)}\n…[工具输出过长，中间内容已省略]…\n${text.slice(-half)}`
  }
  return `[${labelForRole(row.role)}] ${text}`
}

function hashText(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

/**
 * 只读收集当前会话的全部真人交流记录。
 * 使用 deriveMessages() 读取模型可见历史，不 append 任何事件。
 */
function collectSessionRows(agent) {
  let messages
  try {
    messages = agent?.session?.deriveMessages?.()
  } catch {
    messages = undefined
  }
  if (!Array.isArray(messages) || !messages.length) {
    return { rows: [], latestUser: '', firstUser: '', totalMessages: 0 }
  }

  const rows = []
  let firstUser = ''
  let latestUser = ''
  for (const message of messages) {
    if (!message || !['user', 'assistant', 'tool'].includes(message.role)) continue
    // 只把真人写的 user 消息当成“用户交流”，排除系统协议、goal 提醒等注入内容。
    if (message.role === 'user' && message.source && message.source.kind !== 'user') continue
    const text = messageToContextText(message)
    if (!text) continue
    if (message.role === 'user') {
      if (!firstUser) firstUser = text
      latestUser = text
    }
    rows.push({ role: message.role, text })
  }
  return { rows, latestUser, firstUser, totalMessages: rows.length }
}

function splitRowsIntoChunks(rows, maxChars) {
  const chunks = []
  let current = ''
  for (const row of rows) {
    let line = rowToLine(row)
    while (line.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(line.slice(0, maxChars))
      line = line.slice(maxChars)
    }
    if (current && current.length + line.length + 2 > maxChars) {
      chunks.push(current)
      current = ''
    }
    current += (current ? '\n\n' : '') + line
  }
  if (current) chunks.push(current)
  return chunks
}

function buildRecentTail(rows, maxChars) {
  const lines = []
  let used = 0
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    let line = rowToLine(rows[index])
    if (line.length > maxChars) line = line.slice(-maxChars)
    if (lines.length > 0 && used + line.length + 2 > maxChars) break
    lines.unshift(line)
    used += line.length + 2
  }
  return lines.join('\n\n')
}

function contextCacheFile(agent) {
  const id = agent?.session?.header?.id || agent?.id || 'unknown'
  return join(CONTEXT_CACHE_DIR, `${hashText(String(id))}.json`)
}

function loadContextCache(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || parsed.version !== CONTEXT_CACHE_VERSION || !Array.isArray(parsed.chunks)) {
      return { chunks: new Map(), digest: null }
    }
    const chunks = new Map()
    for (const item of parsed.chunks) {
      if (!item || typeof item.hash !== 'string' || typeof item.summary !== 'string') continue
      if (!item.summary.trim()) continue
      chunks.set(item.hash, { summary: item.summary, at: Number.isFinite(item.at) ? item.at : 0 })
    }
    const digest =
      parsed.digest &&
      typeof parsed.digest.key === 'string' &&
      typeof parsed.digest.text === 'string' &&
      parsed.digest.text.trim()
        ? {
            key: parsed.digest.key,
            text: parsed.digest.text,
            at: Number.isFinite(parsed.digest.at) ? parsed.digest.at : 0,
            parts: Array.isArray(parsed.digest.parts)
              ? parsed.digest.parts.filter((part) => typeof part === 'string')
              : [],
          }
        : null
    return { chunks, digest }
  } catch {
    return { chunks: new Map(), digest: null }
  }
}

function saveContextCache(file, cache) {
  try {
    mkdirSync(CONTEXT_CACHE_DIR, { recursive: true })
    const chunks = [...cache.chunks.entries()]
      .map(([hash, value]) => ({ hash, summary: value.summary, at: value.at || 0 }))
      .sort((a, b) => a.at - b.at)
      .slice(-CONTEXT_CACHE_MAX_CHUNKS)
    const digest =
      cache.digest && cache.digest.key && cache.digest.text
        ? {
            key: cache.digest.key,
            text: cache.digest.text,
            at: cache.digest.at || 0,
            parts: Array.isArray(cache.digest.parts) ? cache.digest.parts : [],
          }
        : null
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(
      temporary,
      JSON.stringify({ version: CONTEXT_CACHE_VERSION, chunks, digest, updatedAt: Date.now() }, null, 2),
      'utf8'
    )
    renameSync(temporary, file)
  } catch {
    /* 缓存写失败不影响本次优化 */
  }
}

function loadResultCache() {
  const cache = new Map()
  try {
    const parsed = JSON.parse(readFileSync(RESULT_CACHE_FILE, 'utf8'))
    if (!parsed || parsed.version !== RESULT_CACHE_VERSION || !Array.isArray(parsed.entries)) return cache
    const now = Date.now()
    for (const entry of parsed.entries) {
      if (!entry || typeof entry.key !== 'string' || !entry.result) continue
      if (typeof entry.result.optimized !== 'string' || !entry.result.optimized.trim()) continue
      if (!Number.isFinite(entry.at) || now - entry.at > RESULT_CACHE_TTL_MS) continue
      cache.set(entry.key, {
        at: entry.at,
        hits: Number.isFinite(entry.hits) ? entry.hits : 0,
        result: entry.result,
      })
    }
  } catch {
    /* 没有结果缓存或缓存损坏时，退回正常模型调用 */
  }
  return cache
}

function saveResultCache(cache) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    const entries = [...cache.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, RESULT_CACHE_MAX_ENTRIES)
      .map(([key, value]) => ({ key, at: value.at, hits: value.hits || 0, result: value.result }))
    const temporary = `${RESULT_CACHE_FILE}.${process.pid}.tmp`
    writeFileSync(
      temporary,
      JSON.stringify({ version: RESULT_CACHE_VERSION, entries, updatedAt: Date.now() }, null, 2),
      'utf8'
    )
    renameSync(temporary, RESULT_CACHE_FILE)
  } catch {
    /* 结果缓存写失败不影响本次优化 */
  }
}

const SESSION_SUMMARY_SYSTEM = `你是 DeepSeek Harness 的「会话上下文整理器」。你只阅读和压缩会话记录，不执行任务、不给建议、不修改任何文件。

你的输出会交给另一个「指令优化器」，帮助它理解当前任务。必须保留：
- 用户明确提出过的所有要求，尽量引用原话，尤其是编号清单、验收标准、约束、“不要做什么”；
- 任务目标与背景、已完成步骤和结果、当前进度、关键决定与约定；
- 重要文件、路径、命令、报错、未解决问题和下一步；
- “第 N 条 / 这个 / 刚才 / 继续”这类指代的对应关系。

压缩原则（像 LLMLingua 一样区分“必须保留”和“可以压缩”）：
- 用户消息、明确要求、约束、验收标准、指代对象：强制保留，不压缩、不改写；
- 助手的长解释、重复过程、工具日志：可以压缩成一句进展或结果。

不要编造，不要遗漏用户要求，不要把助手自己猜的内容当成用户要求，不要输出与任务无关的寒暄。用中文简洁要点输出，每段最多约 1000 字；太长的内容会被截断。`

async function streamSummaryText({ llm, agent, prompt, signal, locale }) {
  const route = resolveModelRoute(agent)
  if (!route) throw new Error(t(locale, 'noModel'))
  if (!llm || typeof llm.stream !== 'function') throw new Error(t(locale, 'noModel'))
  const guard = combineAbort(signal, SESSION_SUMMARY_TIMEOUT_MS)
  const startedAt = Date.now()
  let text = ''
  let finish
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system: SESSION_SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      maxTokens: SESSION_SUMMARY_MAX_TOKENS,
      temperature: 0.1,
      signal: guard.signal,
    })) {
      if (!chunk || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta') text += textOf(chunk.text)
      else if (chunk.type === 'finish') finish = chunk.reason
    }
  } catch (error) {
    if (guard.didTimeout()) throw new Error('完整读取会话超时，请重试。')
    if (signal?.aborted) throw new Error(t(locale, 'stopped'))
    throw new Error(`完整读取会话失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    guard.dispose()
  }
  if (guard.didTimeout()) throw new Error('完整读取会话超时，请重试。')
  if (signal?.aborted) throw new Error(t(locale, 'stopped'))
  if (!finish || finish.kind === 'error') {
    throw new Error('完整读取会话失败，本次没有省略历史直接优化。请重试。')
  }
  if (finish.kind === 'aborted') throw new Error(t(locale, 'stopped'))
  if (finish.kind === 'max-tokens') {
    const error = new Error('完整读取会话失败：本段摘要被截断，没有拿到完整内容。')
    error.code = 'summary-max-tokens'
    throw error
  }
  const summary = text.trim()
  if (!summary) {
    throw new Error(
      `完整读取会话失败：摘要为空（结束原因：${finish?.kind || 'none'}）。本次没有省略历史直接优化，请重试。`
    )
  }
  return summary
}

async function summarizeSessionChunk({ llm, agent, chunk, index, total, signal, locale, depth = 0 }) {
  const prompt = `这是一个当前会话完整交流记录的第 ${index + 1}/${total} 段。请完整阅读这一段，提取任务上下文摘要，供下一步优化指令使用。

要求：
1. 按时间顺序整理这一段里的任务目标、用户要求和约束、已完成动作与结果、当前进度、关键决定、重要文件/路径/命令/报错、未解决问题、下一步。
2. 所有用户明确提出的要求都要保留，尽量引用原话；编号清单、验收标准、“不要做什么”尤其不能省略。
3. 用户消息、明确要求、约束、验收标准、指代对象强制保留，不压缩、不改写；助手长解释、重复过程、工具日志可以压缩成一句进展或结果。
4. 保留“第 N 条 / 这个 / 刚才 / 继续”等指代的具体对应关系。
5. 不要执行任务，不要给建议，不要编造；不确定的写“需确认”。
6. 输出中文要点，最多约 900 字；超过 1400 字会被截断。

【第 ${index + 1}/${total} 段记录开始】
${chunk}
【第 ${index + 1}/${total} 段记录结束】`
  try {
    const summary = await streamSummaryText({ llm, agent, prompt, signal, locale })
    return trimTo(summary, SESSION_CHUNK_SUMMARY_MAX_CHARS)
  } catch (error) {
    // 摘要被输出上限截断时，把原始记录再切小，并发重做，而不是让整次优化失败。
    if (error?.code === 'summary-max-tokens' && depth < 4 && chunk.length > 4000) {
      const size = Math.max(6000, Math.ceil(chunk.length / 2))
      const pieces = splitPlainText(chunk, size)
      const summaries = await Promise.all(
        pieces.map((piece, pieceIndex) =>
          summarizeSessionChunk({
            llm,
            agent,
            chunk: piece,
            index: pieceIndex,
            total: pieces.length,
            signal,
            locale,
            depth: depth + 1,
          })
        )
      )
      return trimTo(summaries.join('\n'), SESSION_CHUNK_SUMMARY_MAX_CHARS)
    }
    throw error
  }
}

function splitPlainText(text, maxChars) {
  const pieces = []
  for (let offset = 0; offset < text.length; offset += maxChars) {
    pieces.push(text.slice(offset, offset + maxChars))
  }
  return pieces
}

function mergePrompt(piece, index, total) {
  return `下面是一份很长的会话上下文摘要的合并片段。请把它压缩成更短、但仍能保留任务全貌的摘要。

硬要求：
- 所有用户明确提出的要求必须保留，尽量原话引用，尤其是编号清单、验收标准、约束和“不要做什么”；
- 保留任务目标、已完成进度、关键决定、重要文件/路径/报错、未解决问题和下一步；
- 保留“第 N 条 / 这个 / 刚才 / 继续”的指代关系；
- 不要执行任务，不要给建议，不要编造；不确定的写“需确认”。

【合并片段 ${index + 1}/${total}】
${piece}`
}

async function summarizeMergePiece({ llm, agent, piece, index, total, signal, locale, depth = 0 }) {
  try {
    return await streamSummaryText({
      llm,
      agent,
      prompt: mergePrompt(piece, index, total),
      signal,
      locale,
    })
  } catch (error) {
    if (error?.code === 'summary-max-tokens' && depth < 4 && piece.length > 4000) {
      const size = Math.max(6000, Math.ceil(piece.length / 2))
      const pieces = splitPlainText(piece, size)
      const summaries = await Promise.all(
        pieces.map((part, partIndex) =>
          summarizeMergePiece({
            llm,
            agent,
            piece: part,
            index: partIndex,
            total: pieces.length,
            signal,
            locale,
            depth: depth + 1,
          })
        )
      )
      return summaries.join('\n')
    }
    throw error
  }
}

async function mergeSummaryParts({ llm, agent, summaries, signal, locale, depth = 0 }) {
  const joined = summaries
    .map((summary, index) => `## 摘要片段 ${index + 1}\n${summary}`)
    .join('\n\n')
  if (joined.length <= SESSION_SUMMARY_MAX_CHARS || depth >= 3) return joined
  const pieces = splitPlainText(joined, SESSION_CHUNK_CHARS)
  const merged = []
  for (let start = 0; start < pieces.length; start += SESSION_SUMMARY_CONCURRENCY) {
    const batch = pieces.slice(start, start + SESSION_SUMMARY_CONCURRENCY)
    const summaries = await Promise.all(
      batch.map((piece, offset) =>
        summarizeMergePiece({
          llm,
          agent,
          piece,
          index: start + offset,
          total: pieces.length,
          signal,
          locale,
        })
      )
    )
    merged.push(...summaries)
  }
  const mergedText = merged
    .map((summary, index) => `## 合并摘要 ${index + 1}\n${summary}`)
    .join('\n\n')
  if (mergedText.length >= joined.length) return joined
  return mergeSummaryParts({ llm, agent, summaries: merged, signal, locale, depth: depth + 1 })
}

/**
 * 完整读取当前会话：小会话直接全文；大会话分段完整阅读后汇总。
 * 用户/助手消息不截断；超长工具输出保留首尾，避免几万行日志吞掉上下文。
 */
async function buildSessionContext({ agent, llm, signal, locale }) {
  const collected = collectSessionRows(agent)
  const rows = collected.rows
  if (!rows.length) {
    return {
      text: '',
      latestUser: '',
      firstUser: '',
      totalMessages: 0,
      includedMessages: 0,
      chunks: 0,
      summarized: false,
      chars: 0,
      transcriptChars: 0,
    }
  }

  const transcript = rows.map(rowToLine).join('\n\n')
  if (transcript.length <= FULL_SESSION_VERBATIM_CHARS) {
    return {
      text: transcript,
      latestUser: trimTo(collected.latestUser, 3000),
      firstUser: trimTo(collected.firstUser, 3000),
      totalMessages: rows.length,
      includedMessages: rows.length,
      chunks: 1,
      summarized: false,
      chars: transcript.length,
      transcriptChars: transcript.length,
    }
  }

  const chunks = splitRowsIntoChunks(rows, SESSION_CHUNK_CHARS)
  const chunkHashes = chunks.map((chunk) => hashText(chunk))
  const cacheFile = contextCacheFile(agent)
  const cache = loadContextCache(cacheFile)
  const summaries = new Array(chunks.length)
  const pending = []
  let cacheChanged = false
  const summaryStartedAt = Date.now()

  for (let index = 0; index < chunks.length; index += 1) {
    const cached = cache.chunks.get(chunkHashes[index])?.summary
    if (cached) summaries[index] = cached
    else pending.push(index)
  }

  // 并行读取未缓存的段落；缓存命中时完全不调用模型。
  for (let start = 0; start < pending.length; start += SESSION_SUMMARY_CONCURRENCY) {
    const batch = pending.slice(start, start + SESSION_SUMMARY_CONCURRENCY)
    const batchSummaries = await Promise.all(
      batch.map((index) =>
        summarizeSessionChunk({
          llm,
          agent,
          chunk: chunks[index],
          index,
          total: chunks.length,
          signal,
          locale,
        })
      )
    )
    for (let offset = 0; offset < batch.length; offset += 1) {
      const index = batch[offset]
      const summary = batchSummaries[offset]
      summaries[index] = summary
      cache.chunks.set(chunkHashes[index], { summary, at: Date.now() })
      cacheChanged = true
    }
  }
  const summaryMs = Date.now() - summaryStartedAt
  if (cacheChanged) saveContextCache(cacheFile, cache)

  // 总纪要单独缓存：历史没变时直接复用，避免每次重新合并所有摘要。
  const digestStartedAt = Date.now()
  const digestParts = chunkHashes.map(
    (hash, index) => `${hash}:${hashText(summaries[index])}`
  )
  const digestKey = hashText(digestParts.join('|'))
  const cachedParts =
    cache.digest && Array.isArray(cache.digest.parts) ? cache.digest.parts : []
  const canIncrement =
    cachedParts.length > 0 &&
    cachedParts.length <= digestParts.length &&
    cachedParts.every((part, index) => part === digestParts[index])
  let digest
  const directDigest = summaries
    .map((summary, index) => `## 摘要片段 ${index + 1}\n${summary}`)
    .join('\n\n')
  if (directDigest.length <= SESSION_DIRECT_SUMMARY_CHARS) {
    // 常见长会话：每段摘要直接拼给最终模型，不再多跑一次“总纪要”模型调用。
    // 这样既保留全部段落摘要，又少一次串行模型往返。
    digest = directDigest
    cache.digest = {
      key: digestKey,
      text: digest,
      parts: digestParts,
      at: Date.now(),
    }
    cacheChanged = true
  } else if (cache.digest && cache.digest.key === digestKey) {
    digest = cache.digest.text
    // 老缓存没有 parts 时，顺手补上，下一次新增段落就能增量合并。
    if (!cachedParts.length) {
      cache.digest.parts = digestParts
      cacheChanged = true
    }
  } else if (cache.digest && cache.digest.text && canIncrement) {
    // 只把旧总纪要和新增段摘要合并，不重新合并全部历史摘要。
    const addedSummaries = summaries.slice(cachedParts.length)
    digest = await mergeSummaryParts({
      llm,
      agent,
      summaries: [cache.digest.text, ...addedSummaries],
      signal,
      locale,
    })
    cache.digest = {
      key: digestKey,
      text: digest,
      parts: digestParts,
      at: Date.now(),
    }
    cacheChanged = true
  } else {
    digest = await mergeSummaryParts({ llm, agent, summaries, signal, locale })
    cache.digest = {
      key: digestKey,
      text: digest,
      parts: digestParts,
      at: Date.now(),
    }
    cacheChanged = true
  }
  // 不再把“长度仍偏大”当成失败：保留完整摘要，交给最终模型；
  // 只有模型调用/附件读取等真实失败才报错。
  const digestMs = Date.now() - digestStartedAt
  if (cacheChanged) saveContextCache(cacheFile, cache)
  const timing = {
    summaryMs,
    digestMs,
    newChunks: pending.length,
    cachedChunks: chunks.length - pending.length,
    chunks: chunks.length,
    summaryChars: summaries.reduce((total, summary) => total + String(summary).length, 0),
    digestChars: digest.length,
    transcriptChars: transcript.length,
  }
  const recent = buildRecentTail(rows, SESSION_RECENT_TAIL_CHARS)
  const firstHead = collected.firstUser
    ? `## 会话最初的目标\n${trimTo(collected.firstUser, 3000)}\n\n`
    : ''
  const text = `## 完整会话总览
共完整读取 ${rows.length} 条交流消息，分 ${chunks.length} 段做任务上下文摘要；下面的最近原文用于精确指代。

${firstHead}## 全历史任务摘要
${digest}

## 最近逐字原文
${recent}`

  return {
    text,
    latestUser: trimTo(collected.latestUser, 3000),
    firstUser: trimTo(collected.firstUser, 3000),
    totalMessages: rows.length,
    includedMessages: rows.length,
    chunks: chunks.length,
    summarized: true,
    chars: text.length,
    transcriptChars: transcript.length,
    digestChars: digest.length,
    timing,
  }
}

function buildOptimizerPrompt(request, sessionContext, attachments = [], attachmentReadings = []) {
  const sections = []
  sections.push(`# 用户要优化的原指令（本轮唯一改写对象）\n${request.draft}`)

  if (attachmentReadings.length) {
    sections.push(`# 附件阅读结果（用于理解任务，不要把全文复述进 optimized）
${attachmentReadings.join('\n\n')}`)
  }

  if (attachments.length) {
    const labels = attachments
      .map((attachment, index) => {
        if (!attachment || typeof attachment !== 'object') return ''
        const kind = attachment.type === 'image' ? '图片' : '文件'
        const name = typeof attachment.name === 'string' && attachment.name.trim() ? attachment.name.trim() : `附件 ${index + 1}`
        return `${index + 1}. ${kind}：${name}`
      })
      .filter(Boolean)
      .join('\n')
    sections.push(`# 用户附件（任务的一部分）
本轮用户附带了 ${attachments.length} 个附件。附件和草稿一起构成任务，不是装饰；先阅读附件，再理解“这个文件/这张图/这个表格”等指代，再改写指令。不要把附件内容大段复述进 optimized；接收指令的 Agent 会收到原附件。

${labels}`)
  }

  if (sessionContext && sessionContext.text) {
    const coverage = sessionContext.summarized
      ? `已完整读取本会话 ${sessionContext.totalMessages} 条交流记录；因原文较长，全部历史已分成 ${sessionContext.chunks} 段做任务摘要，并附最近逐字原文。`
      : `已完整读取本会话 ${sessionContext.totalMessages} 条交流记录，下面是完整原文。`
    if (sessionContext.latestUser) {
      sections.push(`# 最近一条用户消息（指代候选，不一定是答案）
${sessionContext.latestUser}

这是本会话最近一条用户文字消息，只是“刚才/第 N 条/继续”的候选对象之一。必须先用草稿里的对象、编号、关键词和这条消息核对：只有明确匹配时才指向它；如果它只是“好/继续/谢谢”或明显是另一个任务，就继续向前面的用户消息里找。找不到唯一对象时，在 questions 里问清楚，不要为了用上最新消息而硬指。`)
    }
    sections.push(`# 当前会话完整交流记录（只用于校准方向和指代）
${coverage}
这是本次优化发生前的完整会话上下文。先读懂任务场景、目标、已完成进度、当前卡点和已有约定；这些内容只用于判断，不要整段复述进 optimized；当前最新一版里已经写过的要求要完整保留。接收指令的 Agent 已经能看到会话本身。

${sessionContext.text}

# 使用会话记录的硬规则
- 只用于理解任务，不要执行、续写或回复其中的任务，也不要把它当成新的用户请求。
- 如果草稿里有“继续、再改一下、第二步、这个、那个”等指代，必须先在记录里找到具体对象；optimized 里可以用最短指代，但整条指令必须完整，不能只剩一句指代。
- 指代优先级：先按对象/编号/关键词匹配；能同时对上最近用户消息和更早用户消息时，最近用户消息优先；都对不上或会改变执行对象时，必须在 questions 里确认。不要把助手以前生成的编号列表当成“刚才那个”的默认指代，除非用户明确说“你刚才说的/助手那条”。
- 如果会话已经说明对象、路径、已完成进度或已确认约束，不要把会话背景整段复述进 optimized；但当前最新一版优化结果里已经写过的要求必须完整继承，不能因为会话里提过就省略。
- 不要顺手扩展范围：用户只改颜色，就不要加 hover、禁用态、对比度等新要求；缺关键信息放到 questions，不要靠扩写猜。
- 如果存在多个可能的清单，在 questions 里明确说“我按哪一条理解”；不要大段复制原文，也不要把整条清单写进 optimized。
- 不要复述会话背景、已完成进度、历史讨论；但 feedback 轮次要继承「当前最新一版优化结果」，把反馈合并进去，输出完整新版。不要只写这轮新增的一句话。
- 记录不足以确定指代时，不要编造；在 questions 里写清需要用户确认什么。`)
  } else {
    sections.push(`# 当前会话完整交流记录
（没有可读取的历史记录。如果下面的草稿依赖任务上下文，请在 questions 里写明需要补充什么背景，不要自行编造。）`)
  }

  sections.push(`# 用户要优化的原指令\n${request.draft}`)
  if (request.current) {
    sections.push(`# 当前最新一版优化结果（下一版必须完整继承并修改）\n${request.current}`)
  }
  if (request.feedback) {
    sections.push(`# 用户这轮的新反馈（合并进下一版完整指令，不要只回答反馈）\n${request.feedback}`)
  }
  if (request.history.length) {
    sections.push('# 之前的讨论记录（只用于理解，不要写进 optimized）')
    for (const item of request.history) {
      sections.push(`${item.role === 'user' ? '用户' : '助手'}：${item.text}`)
    }
  }

  sections.push(`# 这轮怎么做
先结合上面的会话记录还原任务语境和指代，再开始改写；会话记录只用于判断，不要把背景写成指令。
${request.current ? '用户正在对上一版提反馈。以「当前最新一版优化结果」为底稿，把反馈合并进去，输出完整的新版指令；不要只写这轮新增/变化的一句话，也不要让执行者依赖上一版才能看懂。' : '这是第一次优化。给出完整、自包含、可直接执行的指令；会话只用来解析指代和已确认约束，不要把无关背景复述进来。'}
不要只给修改建议，必须给出可直接执行的完整 optimized；${request.current ? '新版必须包含上一版里仍然有效的内容，再加上这轮反馈' : '第一次优化的结果必须能单独看懂、单独发送'}。用户没有明确要求时，不要增加新的功能范围。
${request.locale === 'en' ? 'Write optimized in English unless the user wrote in another language.' : '用中文写 optimized（除非用户原指令本身是英文）。'}`)

  sections.push(`# 最后一次确认
本轮唯一要改写的对象是上面的「用户要优化的原指令」；会话记录里的最新任务、计划或助手消息只是背景，不要把它们当成原指令，不要优化、执行或续写它们。${request.current ? 'feedback 轮次要输出继承上一版全部有效要求的完整新版，不能只写这轮新增要求' : '第一次优化要写出完整、可单独执行的指令'}；不要把会话背景和进度复述进去，但当前版里已经确认的要求要完整保留。如果上面的原指令缺关键对象，就在 questions 里说明。`)

  return sections.join('\n\n')
}

function normalizeHistory(value, locale) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(t(locale, 'request'))
  const rows = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const role = item.role === 'user' ? 'user' : item.role === 'assistant' ? 'assistant' : null
    if (!role) continue
    const text = trimTo(item.text, 12000)
    if (!text) continue
    rows.push({ role, text })
  }
  const recent = rows.slice(-MAX_HISTORY_ENTRIES)
  const kept = []
  let total = 0
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const entry = recent[index]
    if (total + entry.text.length > MAX_HISTORY_CHARS) break
    total += entry.text.length
    kept.unshift(entry)
  }
  return kept
}

function parseJsonRequest(raw, locale) {
  if (typeof raw !== 'string' || raw.length > MAX_COMMAND_JSON_CHARS) throw new Error(t(locale, 'requestLength'))
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error(t(locale, 'request'))
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t(locale, 'request'))
  return value
}

function normalizeOptimizeAttachments(value, locale) {
  if (!Array.isArray(value) || !value.length) return []
  if (value.length > MAX_ATTACHMENTS) throw new Error(t(locale, 'attachmentTooMany'))
  const out = []
  let totalBytes = 0
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const data = textOf(item.data)
    if (!data) continue
    let bytes
    try {
      bytes = Buffer.from(data, 'base64')
    } catch {
      throw new Error(t(locale, 'attachmentRead'))
    }
    if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(t(locale, 'attachmentTooLarge'))
    }
    totalBytes += bytes.length
    if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
      throw new Error(t(locale, 'attachmentTotalTooLarge'))
    }
    const name = trimTo(item.name, 160)
    if (item.type === 'image') {
      const mediaType = String(item.mediaType || '')
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) {
        throw new Error(t(locale, 'attachmentRead'))
      }
      out.push({ type: 'image', mediaType, data, name })
    } else if (item.type === 'file') {
      out.push({ type: 'file', data, name, mediaType: String(item.mediaType || '') })
    }
  }
  return out
}

function normalizeOptimizeReferences(value, locale) {
  if (!Array.isArray(value) || !value.length) return []
  if (value.length > MAX_ATTACHMENT_REFERENCES) throw new Error(t(locale, 'attachmentTooMany'))
  const out = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const ref = textOf(item.ref).trim()
    if (!ref) continue
    out.push({
      ref,
      label: trimTo(item.label, 160) || ref,
      clipboardText: textOf(item.clipboardText) || ref,
      appearance: textOf(item.appearance) || 'file',
    })
  }
  return out
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.log', '.yml', '.yaml',
  '.xml', '.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c',
  '.cpp', '.h', '.hpp', '.go', '.rs', '.rb', '.php', '.sh', '.ps1', '.bat', '.sql', '.ini',
  '.toml', '.conf', '.env', '.srt', '.vtt',
])

function isTextAttachment(name, mediaType) {
  const type = String(mediaType || '').toLowerCase()
  if (type.startsWith('text/') || /json|xml|csv|x-ndjson|yaml/.test(type)) return true
  const lower = String(name || '').toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 && TEXT_EXTENSIONS.has(lower.slice(dot))
}

function decodeAttachmentText(buffer) {
  if (!buffer || !buffer.length) return ''
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer)
    } catch {
      return ''
    }
  }
}

function describeAttachment(name, buffer, mediaType, sourceLabel) {
  const label = name || '未命名附件'
  const bytes = buffer?.length || 0
  if (!isTextAttachment(label, mediaType)) {
    return `${sourceLabel}：${label}（二进制/无法按文本读取，大小 ${bytes} 字节）`
  }
  const text = decodeAttachmentText(buffer).trim()
  if (!text) return `${sourceLabel}：${label}（文本为空或编码无法识别）`
  if (text.length <= ATTACHMENT_FULL_TEXT_CHARS) {
    return `${sourceLabel}：${label}（完整内容）\n${text}`
  }
  const head = text.slice(0, ATTACHMENT_SUMMARY_HEAD_CHARS)
  const tail = text.slice(-ATTACHMENT_SUMMARY_TAIL_CHARS)
  return `${sourceLabel}：${label}（大型文本附件，共 ${text.length} 字；这里只提供文件摘要和首尾摘录，理解它是什么即可，不要假装已经逐字读完）\n开头：${head}\n结尾：${tail}`
}

function buildAttachmentReadings({ attachments, references, cwd }) {
  const sections = []
  for (const attachment of attachments) {
    if (!attachment) continue
    if (attachment.type === 'image') {
      sections.push(`图片附件：${attachment.name || '未命名图片'}（模型会看到图片本身）`)
      continue
    }
    if (attachment.type === 'file') {
      const buffer = Buffer.from(attachment.data || '', 'base64')
      sections.push(
        describeAttachment(attachment.name, buffer, attachment.mediaType, '文件附件')
      )
    }
  }
  for (const reference of references) {
    if (reference.appearance && reference.appearance !== 'file') continue
    const target = String(reference.ref || '').replace(/^@/, '')
    const absolute = isAbsolute(target) ? target : resolve(cwd || process.cwd(), target)
    try {
      const buffer = readFileSync(absolute)
      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        sections.push(`@文件引用：${reference.label || target}（超过 20MB，未读取，大小 ${buffer.length} 字节）`)
      } else {
        sections.push(describeAttachment(reference.label || basename(absolute), buffer, '', '@文件引用'))
      }
    } catch (error) {
      sections.push(
        `@文件引用：${reference.label || target}（读取失败：${error instanceof Error ? error.message : String(error)}）`
      )
    }
  }
  return sections
}

function parseOptimizeRequest(raw, locale) {
  const value = parseJsonRequest(raw, locale)
  const draft = trimTo(value.draft, MAX_DRAFT_CHARS)
  if (!draft) throw new Error(t(locale, 'empty'))
  if (textOf(value.draft).length > MAX_DRAFT_CHARS) throw new Error(t(locale, 'tooLong'))
  const feedback = trimTo(value.feedback, MAX_FEEDBACK_CHARS)
  if (textOf(value.feedback).length > MAX_FEEDBACK_CHARS) throw new Error(t(locale, 'feedbackLong'))
  const current = trimTo(value.current, MAX_CURRENT_CHARS)
  return {
    draft,
    current,
    feedback,
    history: normalizeHistory(value.history, locale),
    attachments: normalizeOptimizeAttachments(value.attachments, locale),
    references: normalizeOptimizeReferences(value.references, locale),
    allowLongContext: value.allowLongContext === true,
    locale: normalizeLocale(value.locale ?? locale),
  }
}

function stripOuterFence(value) {
  const text = textOf(value).trim()
  const match = /^```(?:json|markdown|md)?\s*([\s\S]*?)```$/i.exec(text)
  return match ? match[1].trim() : text
}

function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return []
  const questions = []
  for (const item of raw.slice(0, MAX_QUESTIONS)) {
    if (!item || typeof item !== 'object') continue
    const question = trimTo(item.question, 320)
    if (!question) continue
    const options = []
    for (const option of Array.isArray(item.options) ? item.options.slice(0, MAX_QUESTION_OPTIONS) : []) {
      if (!option || typeof option !== 'object') continue
      const label = trimTo(option.label, 160)
      if (!label) continue
      options.push({ label, value: trimTo(option.value, 300) })
    }
    if (options.length < 2) continue
    questions.push({ question, options })
  }
  return questions
}

function parseModelResult(raw, locale) {
  let text = stripOuterFence(raw)
  if (!text) throw new Error(t(locale, 'modelEmpty'))
  if (!text.startsWith('{')) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) text = text.slice(start, end + 1)
  }

  let value
  try {
    value = JSON.parse(text)
  } catch {
    // 先尝试修掉最常见的尾逗号，再决定是否走“原文兜底”。
    try {
      value = JSON.parse(text.replace(/,\s*([}\]])/g, '$1'))
    } catch {
      if (/"optimized"\s*:|"instruction"\s*:/.test(text)) {
        throw new Error(t(locale, 'parse'))
      }
      // 兜底：模型偶尔只返回指令正文。只要不是明显截断，就把它作为完整指令。
      const looksTruncated = !/[。！？.!?」』”"）)]\s*$/.test(text)
      if (looksTruncated) throw new Error(t(locale, 'modelTruncated'))
      return {
        questions: [],
        optimized: trimTo(text, MAX_OPTIMIZED_CHARS),
        fallback: true,
      }
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t(locale, 'parse'))
  const optimizedText = stripOuterFence(
    typeof value.optimized === 'string'
      ? value.optimized
      : typeof value.instruction === 'string'
        ? value.instruction
        : Array.isArray(value.optimized)
          ? value.optimized.join('\n')
          : ''
  )
  const optimized = trimTo(optimizedText, MAX_OPTIMIZED_CHARS)
  if (!optimized) throw new Error(t(locale, 'modelEmpty'))
  return {
    questions: normalizeQuestions(value.questions),
    optimized,
    fallback: false,
  }
}

function resolveModelRoute(agent) {
  try {
    const config = agent?.session?.requestHeader?.()?.config
    if (config && typeof config.provider === 'string' && config.provider && typeof config.model === 'string' && config.model) {
      return { provider: config.provider, model: config.model }
    }
  } catch {
    /* 回退到 agent options */
  }
  const provider = agent?.options?.provider
  const model = agent?.options?.model
  if (typeof provider === 'string' && provider && typeof model === 'string' && model) {
    return { provider, model }
  }
  return undefined
}

function combineAbort(signal, timeoutMs) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('timeout'))
  }, timeoutMs)
  if (timer && typeof timer.unref === 'function') timer.unref()
  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose() {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    },
  }
}

async function buildAttachmentBlocks(attachmentsService, attachments) {
  if (!attachments.length) return []
  if (
    !attachmentsService ||
    typeof attachmentsService.saveImages !== 'function' ||
    typeof attachmentsService.admitEncodedFile !== 'function'
  ) {
    throw new Error('附件服务不可用，暂时无法读取附件。')
  }
  const blocks = []
  for (const attachment of attachments) {
    if (attachment.type === 'image') {
      const [ref] = await attachmentsService.saveImages([
        {
          data: Buffer.from(attachment.data, 'base64'),
          mediaType: attachment.mediaType,
          ...(attachment.name ? { name: attachment.name } : {}),
        },
      ])
      blocks.push({ type: 'image', attachment: ref })
    } else if (attachment.type === 'file') {
      const ref = await attachmentsService.admitEncodedFile({
        data: attachment.data,
        ...(attachment.name ? { name: attachment.name } : {}),
      })
      blocks.push({ type: 'file', attachment: ref })
    }
  }
  return blocks
}

function needsFullFeedbackRewrite(request, result) {
  if (!request.current || !request.feedback) return false
  const current = textOf(request.current).trim()
  const next = textOf(result?.optimized).trim()
  if (current.length < 80 || !next) return false
  const threshold = Math.min(160, Math.max(120, Math.floor(current.length * 0.65)))
  return next.length < threshold
}

function buildFeedbackRetryPrompt(prompt) {
  return `${prompt}

# 重新生成：上一次只写了这轮新增的一句话
上一次输出不是完整指令，执行者看不到上一版，无法直接执行。请重新输出：
1. 以「当前最新一版优化结果」为底稿；
2. 保留上一版所有仍然有效的要求、范围、格式和约束；
3. 把这轮反馈合并进去；
4. optimized 必须是完整、自包含、可以直接发送的新版，不能只写这轮变化。
仍然只输出合法 JSON，结构不变。`
}

async function streamModel({ llm, agent, prompt, attachmentBlocks = [], signal, locale }) {
  const route = resolveModelRoute(agent)
  if (!route) throw new Error(t(locale, 'noModel'))
  if (!llm || typeof llm.stream !== 'function') throw new Error(t(locale, 'noModel'))

  const content = [{ type: 'text', text: prompt }, ...attachmentBlocks]
  const guard = combineAbort(signal, LLM_TIMEOUT_MS)
  const startedAt = Date.now()
  let text = ''
  let finish
  try {
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      maxTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      signal: guard.signal,
    })
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta') text += textOf(chunk.text)
      else if (chunk.type === 'finish') finish = chunk.reason
    }
  } catch (error) {
    if (guard.didTimeout()) throw new Error(t(locale, 'timeout'))
    if (signal?.aborted) throw new Error(t(locale, 'stopped'))
    throw new Error(`${t(locale, 'model')}：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    guard.dispose()
  }

  if (guard.didTimeout()) throw new Error(t(locale, 'timeout'))
  if (signal?.aborted) throw new Error(t(locale, 'stopped'))
  if (!finish) throw new Error(t(locale, 'modelEmpty'))
  if (finish.kind === 'error') {
    throw new Error(`${t(locale, 'model')}：${finish.failure?.message || t(locale, 'unknown')}`)
  }
  if (finish.kind === 'aborted') throw new Error(t(locale, 'stopped'))
  if (!text.trim()) throw new Error(t(locale, 'modelEmpty'))
  return { text, stopKind: finish.kind, route }
}

function hideInternalCommands(commands) {
  const descriptor = Object.getOwnPropertyDescriptor(commands, 'list')
  const original = commands.list
  let active = true
  const filtered = function (agent) {
    const rows = original.call(this, agent)
    return active ? Object.freeze(rows.filter((row) => !INTERNAL_COMMANDS.has(row.name))) : rows
  }
  Object.defineProperty(commands, 'list', { configurable: true, writable: true, value: filtered })
  return () => {
    active = false
    if (Object.getOwnPropertyDescriptor(commands, 'list')?.value !== filtered) return
    if (descriptor) Object.defineProperty(commands, 'list', descriptor)
    else Reflect.deleteProperty(commands, 'list')
  }
}

export const name = 'dsh-instruction-optimizer'
export const inject = ['commands', 'llm']

export function apply(ctx) {
  const lifetime = new AbortController()
  const llm = ctx.get('llm') || ctx.llm
  const commands = ctx.commands

  ctx.effect(() => hideInternalCommands(commands))
  ctx.effect(() => () => {
    try {
      lifetime.abort()
    } catch {
      /* 插件卸载时的清理 */
    }
  })

  const register = (name, description, handler) =>
    ctx.effect(() =>
      commands.register({
        name,
        description,
        recordInput: false,
        handler,
      })
    )


  register(COMMAND_OPTIMIZE, '内部命令：优化输入框草稿（右侧栏使用）', async (invocation) => {
    const locale = 'zh'
    try {
      const request = parseOptimizeRequest(invocation.rawInput.trim(), locale)
      const attachments = request.attachments
      const requestStartedAt = Date.now()
      const signal =
        typeof AbortSignal.any === 'function'
          ? AbortSignal.any([invocation.signal, lifetime.signal])
          : invocation.signal
      const contextTimeoutMs = request.allowLongContext
        ? SESSION_CONTEXT_TIMEOUT_EXTENDED_MS
        : SESSION_CONTEXT_TIMEOUT_MS
      const contextGuard = combineAbort(signal, contextTimeoutMs)
      let sessionContext
      let contextTimer
      try {
        const timeoutFailure = new Promise((_, reject) => {
          contextTimer = setTimeout(() => {
            reject(new Error(`${CONTEXT_TIMEOUT_MARKER}完整读取会话超时（超过 ${Math.round(contextTimeoutMs / 1000)} 秒）。`))
          }, contextTimeoutMs)
        })
        sessionContext = await Promise.race([
          buildSessionContext({
            agent: invocation.agent,
            llm,
            signal: contextGuard.signal,
            locale,
          }),
          timeoutFailure,
        ])
      } catch (error) {
        if (contextGuard.didTimeout()) {
          const seconds = Math.round(contextTimeoutMs / 1000)
          throw new Error(
            `${CONTEXT_TIMEOUT_MARKER}完整读取会话超时（超过 ${seconds} 秒）。`
          )
        }
        throw error
      } finally {
        if (contextTimer) clearTimeout(contextTimer)
        contextGuard.dispose()
      }
      const contextTiming = sessionContext.timing || {}
      const attachmentReadings = buildAttachmentReadings({
        attachments,
        references: request.references,
        cwd: invocation.agent?.session?.header?.cwd || process.cwd(),
      })
      const optimizerStartedAt = Date.now()
      const prompt = buildOptimizerPrompt(request, sessionContext, attachments, attachmentReadings)
      if (signal?.aborted) throw new Error(t(locale, 'stopped'))
      const route = resolveModelRoute(invocation.agent)
      const attachmentFingerprint = hashText(
        JSON.stringify(
          attachments.map((attachment) => {
            if (!attachment || typeof attachment !== 'object') return ''
            if (attachment.type === 'image') {
              return ['image', attachment.mediaType || '', attachment.name || '', hashText(String(attachment.data || ''))]
            }
            if (attachment.type === 'file') {
              return ['file', attachment.name || '', hashText(String(attachment.data || ''))]
            }
            return ['unknown']
          })
        )
      )
      const resultCacheKey = route
        ? hashText(
            [
              RESULT_CACHE_VERSION,
              hashText(SYSTEM_PROMPT),
              route.provider,
              route.model,
              attachmentFingerprint,
              prompt,
            ].join('\0')
          )
        : ''
      let routeUsed = route
      let optimizerMs = 0
      let cachedHit = false
      let result

      if (resultCacheKey) {
        const resultCache = loadResultCache()
        const entry = resultCache.get(resultCacheKey)
        if (
          entry &&
          entry.result &&
          typeof entry.result.optimized === 'string' &&
          entry.result.optimized.trim()
        ) {
          result = entry.result
          cachedHit = true
          entry.at = Date.now()
          entry.hits = (entry.hits || 0) + 1
          saveResultCache(resultCache)
        }
      }

      if (!cachedHit) {
        const blockAttachments = attachments.filter(
          (attachment) =>
            attachment.type === 'image' ||
            (attachment.type === 'file' && !isTextAttachment(attachment.name, attachment.mediaType))
        )
        const attachmentBlocks = await buildAttachmentBlocks(ctx.get('attachments'), blockAttachments)
        const streamed = await streamModel({
          llm,
          agent: invocation.agent,
          prompt,
          attachmentBlocks,
          signal,
          locale,
        })
        optimizerMs = Date.now() - optimizerStartedAt
        routeUsed = streamed.route
        try {
          result = parseModelResult(streamed.text, locale)
        } catch (error) {
          if (streamed.stopKind === 'max-tokens') throw new Error(t(locale, 'modelTruncated'))
          throw error
        }
        if (needsFullFeedbackRewrite(request, result)) {
          try {
            const retried = await streamModel({
              llm,
              agent: invocation.agent,
              prompt: buildFeedbackRetryPrompt(prompt),
              attachmentBlocks,
              signal,
              locale,
            })
            const retriedResult = parseModelResult(retried.text, locale)
            if (retriedResult.optimized.length > result.optimized.length) result = retriedResult
            routeUsed = retried.route
          } catch (error) {
          }
          optimizerMs = Date.now() - optimizerStartedAt
        }
        if (resultCacheKey) {
          const resultCache = loadResultCache()
          resultCache.set(resultCacheKey, { at: Date.now(), hits: 1, result })
          saveResultCache(resultCache)
        }
      }

      return {
        kind: 'success',
        text: JSON.stringify({
          ok: true,
          questions: result.questions,
          optimized: result.optimized,
          fallback: result.fallback,
          cached: cachedHit,
          route: routeUsed ? `${routeUsed.provider} / ${routeUsed.model}` : '',
          context: {
            messages: sessionContext.totalMessages,
            includedMessages: sessionContext.includedMessages,
            chunks: sessionContext.chunks,
            summarized: sessionContext.summarized === true,
            chars: sessionContext.chars,
            transcriptChars: sessionContext.transcriptChars,
          },
        }),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t(locale, 'unknown')
      return { kind: 'error', text: message }
    }
  })

}
