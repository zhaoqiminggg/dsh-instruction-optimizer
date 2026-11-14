// 指令优化器 · 界面（Client 半）
//
// 入口：输入框右侧工具栏的「优化」按钮。
// 主界面：内置右侧栏里的一个正式标签页，不盖浮层、不另造侧栏。
// 能力：自动优化草稿、多轮讨论修改、直接编辑、一键「使用这个指令」发到主对话。
// 这里只做指令改写。

window.__ModuleLoader__.load({
  id: 'dsh-instruction-optimizer',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    const reactModule = require('react')
    const React =
      reactModule && typeof reactModule.createElement === 'function'
        ? reactModule
        : (reactModule && reactModule.default) || reactModule

    // 直接渲染在右侧栏标签页里，不另开浮层、不覆盖其他页面。
    const NS = 'instruction-optimizer'
    const TAB_ID = 'dsh-instruction-optimizer'
    const TAB_KIND = 'instruction-optimizer'
    const COMMAND_OPTIMIZE = 'dsh-instruction-optimizer-optimize'
    const INTERNAL_COMMANDS = [COMMAND_OPTIMIZE]
    const CONTEXT_TIMEOUT_MARKER = '[context-timeout]'
    const STORAGE_KEY = 'dsh-instruction-optimizer:v1'
    const MAX_STORED_SESSIONS = 20
    const MAX_STORED_MESSAGES = 40
    const MAX_DRAFT_CHARS = 12000
    const MAX_FEEDBACK_CHARS = 4000

    const zh = {
      'locale.id': 'zh',
      'panel.title': '指令优化',
      'panel.subtitle': '把草稿整理成能直接执行的指令',
      'guide.title': '指令优化',
      'guide.description': '整理逻辑、纠正错别字、补齐表达，可多轮修改',
      'trigger.label': '优化指令',
      'trigger.hint': '把输入框里的草稿整理成清晰、专业、按需展开的指令',
      'trigger.keepReferences': '优化时保留草稿里的 @文件引用，使用指令时一起带回',
      'action.close': '收起右侧栏',
      'action.new': '开始新的优化',
      'action.use': '使用这个指令',
      'action.useHint': '替换主输入框里的内容，并立即发送',
      'action.restore': '放回原草稿',
      'action.restoreHint': '不发送，只把优化前的草稿放回输入框',
      'action.copy': '复制',
      'action.edit': '直接修改',
      'action.save': '保存修改',
      'action.cancel': '取消',
      'action.stop': '停止',
      'action.start': '开始优化',
      'action.feedback': '发送反馈',
      'status.optimizing': '正在整理…',
      'status.understanding': '正在理解对话记录，给出更精准的优化',
      'status.elapsed': '已等待 {s} 秒',
      'status.thinking': '正在想更好的写法…',
      'status.sent': '已发送到主对话',
      'empty.title': '把草稿变成清楚的指令',
      'empty.line1': '在下面写或粘贴你想让 DSH 做的事，口语一点也没关系。',
      'empty.line2': '点“开始优化”，右侧会给出整理后的版本。',
      'empty.line3': '满意就点“使用这个指令”；不满意可以继续写反馈。',
      'empty.startPlaceholder': '把要优化的指令写在这里…',
      'input.placeholder': '哪里不满意？直接说，例如：第 2 步太啰嗦，保留验收标准',
      'input.hint': 'Enter 发送 · Shift + Enter 换行',
      'card.title': '优化后的指令',
      'card.version': '第 {n} 版',
      'card.questions': '需要你确认',
      'card.clarifySending': '正在按你的选择重写…',
      'card.fallback': '模型这次没有按结构返回，下面是它的原文。请先直接修改或复制，不能直接使用。',
      'clarify.feedback': '针对“{question}”，我选择：{label}{valueText}。请按这个选择重写，并继续保留前面已确认的要求。',
      'toast.clarify': '已带上你的选择，正在重新优化一版。',
      'error.backend': '优化后台暂时不可用，请稍后再试。',
      'error.stopped': '已停止这次优化。',
      'error.send': '发送失败，请重试。',
      'error.sendBackend': '找不到主输入框，暂时不能直接发送。',
      'error.attachmentRead': '附件暂时读不了，请等上传完成或换成可读取的文件后重试。',
      'error.attachmentTooLarge': '附件太大了（单个最多 20MB），请压缩或换一个小一点的文件。',
      'error.session': '还没有可以优化的会话。',
      'error.noDraft': '先写一点内容，再开始优化。',
      'error.tooLong': '内容太长了，请精简到 12000 字以内再试。',
      'error.feedbackLong': '反馈太长了，请精简到 4000 字以内再试。',
      'error.load': '这次优化没有成功，可以直接再发一次反馈。',
      'toast.sent': '已替换输入框并发送。',
      'toast.copied': '已复制到剪贴板。',
      'toast.new': '已开始新的优化。',
      'toast.restored': '已把原草稿放回输入框，未发送。',
      'confirm.draftChanged': '优化期间输入框草稿已经改动。继续会覆盖当前草稿并立即发送，确定继续吗？',
      'confirm.draftChangedRestore': '输入框里的草稿已经改动，放回原草稿会覆盖当前内容。确定继续吗？',
      'context.prompt': '会话记录太长了，可以允许我思考更长时间给出更准确的优化指令吗？',
      'context.agree': '同意',
      'context.cancel': '取消',
      'context.cancelled': '已取消这次优化。',
      'context.timeout': '会话记录太长了，这次没有读完。',
      'error.referencesRestore': '当前输入框不支持恢复引用，已把原草稿放回，没有发送。',
    }

    const en = {
      'locale.id': 'en',
      'panel.title': 'Instruction Optimizer',
      'panel.subtitle': 'Turn a draft into an instruction you can run',
      'guide.title': 'Instruction Optimizer',
      'guide.description': 'Reorder, proofread, and complete a draft, with follow-up revisions',
      'trigger.label': 'Optimize instruction',
      'trigger.hint': 'Turn the composer draft into a clear, professional, appropriately scoped instruction',
      'trigger.keepReferences': 'Keep the @file reference in the draft and carry it back with the optimized instruction',
      'action.close': 'Collapse the right sidebar',
      'action.new': 'Start a new optimization',
      'action.use': 'Use this instruction',
      'action.useHint': 'Replace the main composer draft and send it immediately',
      'action.restore': 'Restore original',
      'action.restoreHint': 'Put the original draft back in the composer without sending it',
      'action.copy': 'Copy',
      'action.edit': 'Edit',
      'action.save': 'Save changes',
      'action.cancel': 'Cancel',
      'action.stop': 'Stop',
      'action.start': 'Start optimizing',
      'action.feedback': 'Send feedback',
      'status.optimizing': 'Organizing…',
      'status.understanding': 'Understanding the conversation to give a more precise optimization',
      'status.elapsed': 'Waiting {s}s',
      'status.thinking': 'Finding a better wording…',
      'status.sent': 'Sent to the conversation',
      'empty.title': 'Turn a draft into a clear instruction',
      'empty.line1': 'Write or paste what you want DSH to do below; casual wording is fine.',
      'empty.line2': 'Press “Start optimizing” and a cleaned-up version appears here.',
      'empty.line3': 'Use it when it fits; if not, keep giving feedback.',
      'empty.startPlaceholder': 'Write the instruction you want optimized…',
      'input.placeholder': 'What should change? E.g. step 2 is too long; keep the acceptance criteria',
      'input.hint': 'Enter to send · Shift + Enter for a new line',
      'card.title': 'Optimized instruction',
      'card.version': 'Version {n}',
      'card.questions': 'Needs your call',
      'card.clarifySending': 'Rewriting with your answer…',
      'card.fallback': 'The model did not return the structured shape this time; its raw text is below. Edit it or copy it; it cannot be used directly.',
      'clarify.feedback': 'For "{question}", I choose: {label}{valueText}. Please rewrite with this choice and keep the previously confirmed requirements.',
      'toast.clarify': 'Your answer was added; regenerating a version.',
      'error.backend': 'The optimizer backend is unavailable. Try again shortly.',
      'error.stopped': 'This optimization was stopped.',
      'error.send': 'Sending failed. Try again.',
      'error.sendBackend': 'The main composer could not be reached, so this cannot be sent directly.',
      'error.attachmentRead': 'The attachment cannot be read yet. Wait for the upload to finish or use a readable file, then retry.',
      'error.attachmentTooLarge': 'That attachment is too large (20 MB per file). Compress it or use a smaller file.',
      'error.session': 'There is no session to optimize yet.',
      'error.noDraft': 'Write something before starting.',
      'error.tooLong': 'That is too long. Shorten it to 12,000 characters or fewer.',
      'error.feedbackLong': 'That feedback is too long. Shorten it to 4,000 characters or fewer.',
      'error.load': 'This optimization failed. You can send the feedback again.',
      'toast.sent': 'The composer was replaced and the instruction was sent.',
      'toast.copied': 'Copied to the clipboard.',
      'toast.new': 'Started a new optimization.',
      'toast.restored': 'Original draft restored without sending.',
      'confirm.draftChanged': 'The composer draft changed while optimizing. Continuing will overwrite it and send immediately. Continue?',
      'confirm.draftChangedRestore': 'The composer draft changed. Restoring the original will overwrite the current content. Continue?',
      'context.prompt': 'The conversation is too long. May I spend more time thinking to give you a more accurate optimized instruction?',
      'context.agree': 'Agree',
      'context.cancel': 'Cancel',
      'context.cancelled': 'This optimization was cancelled.',
      'context.timeout': 'The conversation is too long and could not be read completely this time.',
      'error.referencesRestore': 'This composer cannot restore references, so the original draft was put back and nothing was sent.',
    }

    const CSS = [
      '.io-anchor{width:100%;height:100%;min-height:420px;display:flex;flex-direction:column;overflow:hidden;}',
      '.io-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary,#111827);font-size:13px;line-height:1.55;}',
      '.io-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:9px 10px 9px 13px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.10));min-height:48px;box-sizing:border-box;}',
      '.io-head-mark{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;color:var(--dsw-alias-brand-primary,#0f766e);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0f766e) 9%,transparent);}',
      '.io-head-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto;}',
      '.io-title{font-size:13.5px;font-weight:650;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.io-subtitle{font-size:10.5px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.io-head-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto;}',
      '.io-new-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 12px;border:1px solid transparent;border-radius:9px;background:var(--dsw-alias-brand-primary,#0f766e);color:#fff;font:inherit;font-size:12px;font-weight:650;white-space:nowrap;cursor:pointer;}',
      '.io-new-btn:hover:not(:disabled){filter:brightness(1.06);}',
      '.io-new-btn:disabled{opacity:.45;cursor:default;}',
      '.io-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;}',
      '.io-icon:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111827);}',
      '.io-icon:disabled{opacity:.35;cursor:default;}',
      '.io-icon:focus-visible,.io-new-btn:focus-visible,.io-btn:focus-visible,.io-trigger:focus-visible,.io-textarea:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#0f766e);outline-offset:1px;}',
      '.io-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 12px 16px;display:flex;flex-direction:column;gap:12px;}',
      '.io-empty{margin:auto 0;padding:18px 4px 8px;display:flex;flex-direction:column;gap:10px;}',
      '.io-empty-title{font-size:14px;font-weight:650;letter-spacing:.01em;}',
      '.io-empty-lines{display:flex;flex-direction:column;gap:8px;margin-top:2px;}',
      '.io-empty-line{display:flex;gap:8px;align-items:flex-start;font-size:12px;line-height:1.65;color:var(--dsw-alias-label-secondary,#6b7280);}',
      '.io-dot{flex:0 0 auto;width:5px;height:5px;margin-top:8px;border-radius:50%;background:var(--dsw-alias-brand-primary,#0f766e);}',
      '.io-msg{display:flex;flex-direction:column;max-width:100%;}',
      '.io-user{align-items:flex-end;}',
      '.io-user-bubble{max-width:92%;padding:7px 10px;border-radius:11px 11px 3px 11px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0f766e) 11%,transparent);white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px;line-height:1.62;}',
      '.io-assistant{gap:8px;}',
      '.io-card{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.11));border-radius:12px;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 1px 2px rgba(0,0,0,.03);overflow:hidden;}',
      '.io-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02));}',
      '.io-card-title{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:650;color:var(--dsw-alias-label-secondary,#4b5563);}',
      '.io-version{font-size:10.5px;color:var(--dsw-alias-label-secondary,#9ca3af);font-variant-numeric:tabular-nums;}',
      '.io-questions{margin:0 10px 9px;padding:9px 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b45309) 22%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b45309) 5%,transparent);}',
      '.io-questions-title{font-size:12px;font-weight:600;color:var(--dsw-alias-state-warning-primary,#b45309);}',
      '.io-question{margin-top:8px;}',
      '.io-question-text{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-primary,#111827);}',
      '.io-options{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}',
      '.io-option{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:999px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.6));color:var(--dsw-alias-label-primary,#111827);font:inherit;font-size:11.5px;line-height:1.4;padding:4px 10px;cursor:pointer;}',
      '.io-option:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary,#0f766e);}',
      '.io-option:disabled{opacity:.5;cursor:default;}',
      '.io-instruction{padding:11px 11px 12px;font-size:12.5px;line-height:1.72;white-space:pre-wrap;overflow-wrap:anywhere;max-height:440px;overflow-y:auto;overscroll-behavior:contain;}',
      '.io-edit{box-sizing:border-box;display:block;width:100%;min-height:220px;max-height:520px;resize:vertical;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:9px;padding:9px 10px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111827);font:inherit;font-size:12.5px;line-height:1.7;outline:none;}',
      '.io-edit-wrap{padding:10px;display:flex;flex-direction:column;gap:8px;}',
      '.io-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:0 10px 10px;}',
      '.io-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:29px;padding:0 10px;border-radius:8px;border:1px solid transparent;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;}',
      '.io-btn:disabled{opacity:.48;cursor:default;}',
      '.io-btn-primary{background:var(--dsw-alias-brand-primary,#0f766e);color:#fff;border-color:transparent;}',
      '.io-btn-primary:not(:disabled):hover{filter:brightness(1.06);}',
      '.io-btn-secondary{border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.16));background:transparent;color:var(--dsw-alias-label-primary,#111827);}',
      '.io-btn-secondary:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}',
      '.io-sent{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:var(--dsw-alias-state-success-primary,#15803d);}',
      '.io-note{margin:0 10px 10px;border-radius:8px;padding:7px 9px;font-size:11px;line-height:1.62;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.10));color:var(--dsw-alias-label-secondary,#4b5563);background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02));}',
      '.io-pending{display:flex;align-items:center;gap:8px;padding:11px 2px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;}',
      '.io-elapsed{opacity:.72;font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.io-typing{display:inline-flex;gap:3px;align-items:center;}',
      '.io-typing i{display:block;width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.3;animation:io-blink 1.15s infinite ease-in-out;}',
      '.io-typing i:nth-child(2){animation-delay:.16s;}.io-typing i:nth-child(3){animation-delay:.32s;}',
      '@keyframes io-blink{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:.9;transform:translateY(-1px)}}',
      '.io-error{border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#b91c1c) 22%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b91c1c) 5%,transparent);border-radius:9px;padding:8px 10px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-state-error-primary,#b91c1c);}',
      '.io-composer{flex:0 0 auto;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.10));padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-base,transparent);}',
      '.io-textarea{box-sizing:border-box;display:block;width:100%;min-height:58px;max-height:176px;resize:none;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:9px;padding:7px 9px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111827);font:inherit;font-size:12.5px;line-height:1.6;outline:none;}',
      '.io-textarea::placeholder{color:var(--dsw-alias-label-secondary,#9ca3af);}',
      '.io-composer-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.io-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary,#9ca3af);line-height:1.45;}',
      '.io-toast{position:sticky;bottom:6px;align-self:center;max-width:92%;padding:6px 10px;border-radius:8px;background:var(--dsw-alias-label-primary,#111827);color:var(--dsw-alias-bg-base,#fff);font-size:11px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,.16);z-index:2;}',
      '.io-toast[data-kind="error"]{background:var(--dsw-alias-state-error-primary,#b91c1c);}',
      '.io-trigger{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:30px;padding:0 8px;flex:0 0 auto;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:none;color:var(--dsw-alias-label-secondary,#6b7280);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;}',
      '.io-trigger:hover:not(:disabled){color:var(--dsw-alias-label-primary,#111827);border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2));background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}',
      '.io-trigger:disabled{opacity:.42;cursor:default;}',
      '@media (max-width:520px){.io-trigger span{display:none}.io-trigger{width:30px;padding:0}}',
      '@media (prefers-reduced-motion:reduce){.io-typing i{animation:none;opacity:.6}}',
    ].join('\n')

    const ICONS = {
      sparkles: [
        'M12 3l1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35Z',
        'M5 14l.85 2.15L8 17l-2.15.85L5 20l-.85-2.15L2 17l2.15-.85Z',
        'M19 13l.7 1.8 1.8.7-1.8.7L19 18l-.7-1.8-1.8-.7 1.8-.7Z',
      ],
      close: ['M18 6 6 18', 'M6 6l12 12'],
      copy: [
        'M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2Z',
        'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
      ],
      check: ['m5 12 5 5L20 7'],
      edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
      send: ['M12 19V5', 'm5 12 7-7 7 7'],
      undo: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
      refresh: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v6h-6'],
      stop: ['M7 7h10v10H7z'],
    }

    function Icon(name, size) {
      const paths = ICONS[name] || ICONS.sparkles
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        paths.map((d, index) => React.createElement('path', { key: index, d }))
      )
    }

    function uid() {
      const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
      if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = (Math.random() * 16) | 0
        const value = char === 'x' ? random : (random & 0x3) | 0x8
        return value.toString(16)
      })
    }

    function copyText(text) {
      const fallback = () => {
        try {
          const area = document.createElement('textarea')
          area.value = text
          area.setAttribute('readonly', 'readonly')
          area.style.position = 'fixed'
          area.style.top = '-1000px'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          document.execCommand('copy')
          document.body.removeChild(area)
        } catch {
          /* 静默失败；按钮仍可用 */
        }
      }
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).catch(fallback)
          return
        }
      } catch {
        /* 落到兜底方案 */
      }
      fallback()
    }

    function sanitizeStoredQuestions(value) {
      if (!Array.isArray(value)) return []
      const out = []
      for (const item of value.slice(0, 3)) {
        if (!item || typeof item !== 'object') continue
        const question = typeof item.question === 'string' ? item.question.trim() : ''
        if (!question) continue
        const options = []
        for (const option of Array.isArray(item.options) ? item.options.slice(0, 4) : []) {
          if (!option || typeof option !== 'object') continue
          const label = typeof option.label === 'string' ? option.label.trim() : ''
          if (!label) continue
          options.push({
            label,
            value: typeof option.value === 'string' ? option.value.trim() : '',
          })
        }
        if (options.length >= 2) out.push({ question, options })
      }
      return out
    }

    function sanitizeMessage(message) {
      if (!message || typeof message !== 'object') return null
      const role = message.role === 'user' ? 'user' : message.role === 'assistant' ? 'assistant' : null
      if (!role) return null
      const at = Number.isFinite(message.at) ? message.at : Date.now()
      const id = typeof message.id === 'string' && message.id ? message.id : uid()
      if (role === 'user') {
        const text = typeof message.text === 'string' ? message.text : ''
        if (!text.trim()) return null
        return { id, role, text, at }
      }
      let status = message.status === 'done' || message.status === 'error' ? message.status : 'done'
      if (message.status === 'pending') status = 'error'
      return {
        id,
        role,
        status,
        at,
        version: Number.isFinite(message.version) ? message.version : 1,
        optimized: typeof message.optimized === 'string' ? message.optimized : '',
        questions: sanitizeStoredQuestions(message.questions),
        error: typeof message.error === 'string' ? message.error : '',
        sentAt: Number.isFinite(message.sentAt) ? message.sentAt : 0,
        fallback: message.fallback === true,
      }
    }

    function sanitizeConversation(raw) {
      if (!raw || typeof raw !== 'object') return null
      const messages = Array.isArray(raw.messages) ? raw.messages.map(sanitizeMessage).filter(Boolean) : []
      const trimmed = messages.slice(-MAX_STORED_MESSAGES)
      return {
        original: typeof raw.original === 'string' ? raw.original : '',
        messages: trimmed,
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
      }
    }

    function loadSnapshot() {
      const base = { bySession: {} }
      let parsed
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return base
        parsed = JSON.parse(raw)
      } catch {
        return base
      }
      if (!parsed || typeof parsed !== 'object') return base
      const bySession = {}
      const source = parsed.bySession && typeof parsed.bySession === 'object' ? parsed.bySession : {}
      for (const sessionId of Object.keys(source)) {
        const conversation = sanitizeConversation(source[sessionId])
        if (conversation && (conversation.original || conversation.messages.length)) {
          bySession[sessionId] = conversation
        }
      }
      return { bySession }
    }

    function persistSnapshot(state) {
      try {
        const rows = Object.keys(state.bySession)
          .map((sessionId) => ({ sessionId, conversation: state.bySession[sessionId] }))
          .sort((a, b) => b.conversation.updatedAt - a.conversation.updatedAt)
        const bySession = {}
        for (const row of rows.slice(0, MAX_STORED_SESSIONS)) {
          bySession[row.sessionId] = {
            original: row.conversation.original,
            messages: row.conversation.messages.slice(-MAX_STORED_MESSAGES),
            updatedAt: row.conversation.updatedAt,
          }
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bySession }))
      } catch {
        /* 存储不可用时不影响使用 */
      }
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (!slots || typeof slots.register !== 'function') {
        console.error('[instruction-optimizer] slot service unavailable')
        return
      }

      let translate = (key) => key
      if (ctx.locale) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }))
        translate = ctx.locale.bind(NS)
      }
      const fallbackT = (key, params) => {
        const template = zh[key] !== undefined ? zh[key] : key
        return String(template).replace(/\{(\w+)\}/g, (match, name) =>
          params && name in params ? String(params[name]) : match
        )
      }
      const globalT = (key, params) => {
        try {
          return translate(key, params)
        } catch {
          return fallbackT(key, params)
        }
      }

      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-instruction-optimizer'
        style.dataset.pluginCss = 'dsh-instruction-optimizer/client.css'
        style.textContent = CSS
        ;(document.head || document.documentElement).appendChild(style)
        return () => style.remove()
      })

      const initial = loadSnapshot()
      let state = initial
      const listeners = new Set()
      let saveTimer = null
      const runs = new Map()
      const handledTriggers = new Set()

      const emit = () => {
        for (const listener of Array.from(listeners)) {
          try {
            listener()
          } catch (error) {
            console.error('[instruction-optimizer] listener failed', error)
          }
        }
      }

      const scheduleSave = () => {
        if (saveTimer) return
        saveTimer = setTimeout(() => {
          saveTimer = null
          persistSnapshot(state)
        }, 300)
      }

      const conversationOf = (sessionId) => (sessionId ? state.bySession[sessionId] : undefined)

      const updateConversation = (sessionId, mutator) => {
        if (!sessionId) return
        const current = conversationOf(sessionId) || { original: '', messages: [], updatedAt: Date.now() }
        const next = mutator(current)
        state = {
          ...state,
          bySession: { ...state.bySession, [sessionId]: { ...next, updatedAt: Date.now() } },
        }
        scheduleSave()
        emit()
      }

      const store = {
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        get: () => state,
        conversation: conversationOf,
        isBusy: (sessionId) => Boolean(sessionId && runs.has(sessionId)),
        start(sessionId, original) {
          if (!sessionId) return
          runs.get(sessionId)?.controller.abort()
          runs.delete(sessionId)
          state = {
            ...state,
            bySession: {
              ...state.bySession,
              [sessionId]: { original: String(original || ''), messages: [], updatedAt: Date.now() },
            },
          }
          scheduleSave()
          emit()
        },
        push(sessionId, messages) {
          updateConversation(sessionId, (current) => ({
            ...current,
            messages: current.messages.concat(messages).slice(-MAX_STORED_MESSAGES),
          }))
        },
        patch(sessionId, messageId, patch) {
          updateConversation(sessionId, (current) => ({
            ...current,
            messages: current.messages.map((message) =>
              message.id === messageId ? { ...message, ...patch } : message
            ),
          }))
        },
        clear(sessionId) {
          if (!sessionId) return
          const activeRun = runs.get(sessionId)
          if (activeRun) {
            try {
              activeRun.controller.abort()
            } catch {
              /* 忽略 */
            }
            runs.delete(sessionId)
          }
          const bySession = { ...state.bySession }
          delete bySession[sessionId]
          state = { ...state, bySession }
          scheduleSave()
          emit()
        },
        flush() {
          if (saveTimer) {
            clearTimeout(saveTimer)
            saveTimer = null
          }
          persistSnapshot(state)
        },
      }

      const invoke = async (sessionId, command, payload, signal, attachments = []) => {
        const remote = ctx.get('remote')
        if (!remote || !remote.commands || typeof remote.commands.execute !== 'function') {
          throw new Error(globalT('error.backend'))
        }
        const line = '/' + command + ' ' + JSON.stringify(payload || {})
        let response
        try {
          response = await remote.commands.execute(sessionId, line, attachments, signal)
        } catch (error) {
          if (signal && signal.aborted) throw new Error(globalT('error.stopped'))
          throw new Error(error instanceof Error && error.message ? error.message : globalT('error.backend'))
        }
        if (signal && signal.aborted) throw new Error(globalT('error.stopped'))
        if (!response || response.ok !== true) {
          const failure = (response && response.error) || {}
          throw new Error(failure.message || globalT('error.backend'))
        }
        const result = response.value && response.value.result
        if (!result) throw new Error(globalT('error.backend'))
        if (result.kind === 'error') throw new Error(result.text || globalT('error.backend'))
        if (result.kind !== 'success') throw new Error(globalT('error.backend'))
        try {
          return JSON.parse(result.text || '{}')
        } catch {
          throw new Error(globalT('error.backend'))
        }
      }

      const fileToBase64 = async (file) => {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        const chunk = 0x8000
        for (let offset = 0; offset < bytes.length; offset += chunk) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
        }
        return btoa(binary)
      }

      const serializeComposerAttachments = async (sessionId) => {
        const inputState = readComposerState(sessionId)
        const attachmentIds = inputState && Array.isArray(inputState.attachmentIds) ? inputState.attachmentIds : []
        if (!attachmentIds.length) return []
        const conversationService = ctx.get('conversation')
        if (!conversationService || typeof conversationService.resolveDraftAttachments !== 'function') {
          throw new Error(globalT('error.attachmentRead'))
        }
        let drafts
        try {
          drafts = conversationService.resolveDraftAttachments(attachmentIds)
        } catch (error) {
          throw new Error(
            `${globalT('error.attachmentRead')}：${
              error instanceof Error && error.message ? error.message : '无法读取附件内容'
            }`
          )
        }
        if (!Array.isArray(drafts) || drafts.length !== attachmentIds.length) {
          throw new Error(globalT('error.attachmentRead'))
        }
        const attachments = []
        for (const draft of drafts) {
          if (!draft || !draft.file) throw new Error(globalT('error.attachmentRead'))
          if (draft.file.size > 20 * 1024 * 1024) {
            throw new Error(globalT('error.attachmentTooLarge'))
          }
          const data = await fileToBase64(draft.file)
          if (draft.kind === 'image') {
            const mediaType = String(draft.file.type || '')
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) {
              throw new Error(globalT('error.attachmentRead'))
            }
            attachments.push({ type: 'image', mediaType, data, name: draft.file.name || '' })
          } else {
            attachments.push({
              type: 'file',
              data,
              name: draft.file.name || '',
              mediaType: String(draft.file.type || ''),
            })
          }
        }
        return attachments
      }

      const serializeComposerReferences = (sessionId) => {
        const state = readComposerState(sessionId)
        if (!state || !Array.isArray(state.occurrences)) return []
        return state.occurrences
          .filter((occurrence) => occurrence && typeof occurrence.ref === 'string')
          .map((occurrence) => ({
            source: occurrence.source || 'reference',
            ref: occurrence.ref,
            label: occurrence.label || occurrence.ref,
            appearance: occurrence.appearance || 'file',
            clipboardText: occurrence.clipboardText || occurrence.ref,
          }))
      }

      const runOptimize = async (sessionId, options = {}) => {
        if (!sessionId || runs.has(sessionId)) return undefined
        const conversation = conversationOf(sessionId)
        if (!conversation) return undefined

        const retry = options.retry && typeof options.retry === 'object' ? options.retry : null
        const feedback = retry ? '' : String(options.feedback || '').trim()
        const source = retry ? 'retry' : feedback ? 'feedback' : 'initial'
        const references = serializeComposerReferences(sessionId)
        if (!retry && feedback.length > MAX_FEEDBACK_CHARS) {
          return { error: fallbackT('error.feedbackLong') }
        }
        if (!retry && !feedback && options.initial !== true) return undefined

        const previous = conversation.messages.slice()
        const lastDone = [...previous].reverse().find((message) => message.role === 'assistant' && message.status === 'done')
        const current = lastDone && lastDone.optimized ? lastDone.optimized : ''
        const history = []
        for (const message of previous) {
          if (message.role === 'assistant' && message.status === 'done' && message.optimized) {
            history.push({ role: 'assistant', text: message.optimized })
          } else if (message.role === 'user' && message.text) {
            history.push({ role: 'user', text: message.text })
          }
        }
        const trimmedHistory = history.slice(-10)
        const version =
          previous.reduce(
            (max, message) => Math.max(max, Number.isFinite(message.version) ? message.version : 0),
            0
          ) + 1
        const runId = uid()
        const pendingId = retry && typeof retry.pendingId === 'string' ? retry.pendingId : uid()
        const controller = new AbortController()
        runs.set(sessionId, { id: runId, pendingId, controller })

        if (retry) {
          store.patch(sessionId, pendingId, {
            status: 'pending',
            error: '',
            contextTimeout: false,
            retryPayload: undefined,
            at: Date.now(),
          })
        } else {
          if (feedback) {
            store.push(sessionId, [{ id: uid(), role: 'user', text: feedback, at: Date.now() }])
          }
          store.push(sessionId, [
            { id: pendingId, role: 'assistant', status: 'pending', at: Date.now(), version },
          ])
        }
        emit()

        let attachments = []
        try {
          attachments = await serializeComposerAttachments(sessionId)
        } catch (error) {
          if (runs.get(sessionId)?.id !== runId) return undefined
          runs.delete(sessionId)
          const message = error instanceof Error && error.message ? error.message : globalT('error.attachmentRead')
          store.patch(sessionId, pendingId, { status: 'error', error: message })
          emit()
          return { error: message }
        }

        const payload =
          retry && retry.payload && typeof retry.payload === 'object'
            ? { ...retry.payload, allowLongContext: true, attachments }
            : {
                draft: conversation.original,
                current,
                feedback,
                history: trimmedHistory,
                attachments,
                references,
                allowLongContext: options.allowLongContext === true,
                locale: globalT('locale.id'),
              }

        let result
        const invokeStartedAt = Date.now()
        try {
          result = await invoke(
            sessionId,
            COMMAND_OPTIMIZE,
            payload,
            controller.signal
          )
          if (runs.get(sessionId)?.id !== runId) return result
          runs.delete(sessionId)
          store.patch(sessionId, pendingId, {
            status: 'done',
            questions: Array.isArray(result.questions) ? result.questions : [],
            optimized: typeof result.optimized === 'string' ? result.optimized : '',
            fallback: result.fallback === true,
            error: '',
            contextTimeout: false,
            retryPayload: undefined,
          })
          emit()
          return result
        } catch (error) {
          if (runs.get(sessionId)?.id !== runId) return undefined
          runs.delete(sessionId)
          const raw =
            controller.signal.aborted
              ? globalT('error.stopped')
              : error instanceof Error && error.message
                ? error.message
                : globalT('error.load')
          const contextTimeout = raw.startsWith(CONTEXT_TIMEOUT_MARKER)
          const message = contextTimeout
            ? raw.slice(CONTEXT_TIMEOUT_MARKER.length).trim() || globalT('context.timeout')
            : raw
          const canRetry = contextTimeout && payload.allowLongContext !== true
          store.patch(sessionId, pendingId, {
            status: 'error',
            error: message,
            contextTimeout: canRetry,
            ...(canRetry
              ? { retryPayload: { ...payload, attachments: undefined } }
              : { retryPayload: undefined }),
          })
          emit()
          return { error: message, contextTimeout: canRetry }
        }
      }

      const stopRun = (sessionId) => {
        const run = runs.get(sessionId)
        if (!run) return
        runs.delete(sessionId)
        run.controller.abort()
        store.patch(sessionId, run.pendingId, { status: 'error', error: globalT('error.stopped') })
        emit()
      }

      const inputFacadeFor = (sessionId) => {
        if (!sessionId) return undefined
        const sessions = ctx.get('sessions')
        const conversationService = ctx.get('conversation')
        const actx = sessions && typeof sessions.scope === 'function' ? sessions.scope(sessionId) : undefined
        return actx &&
          conversationService &&
          conversationService.input &&
          typeof conversationService.input.for === 'function'
          ? conversationService.input.for(actx)
          : undefined
      }

      const readComposerState = (sessionId) => {
        const facade = inputFacadeFor(sessionId)
        if (!facade || !facade.state || typeof facade.state.getSnapshot !== 'function') return null
        try {
          return facade.state.getSnapshot()
        } catch {
          return null
        }
      }

      const restoreComposerWithReferences = (facade, before, references) => {
        if (!facade || !before) return false
        if (references.length && typeof facade.addFiles !== 'function') return false
        facade.setDraft(before.draft)
        if (references.length && facade.addFiles(references, []) === false) return false
        return true
      }

      const useInstruction = async (sessionId, message, text) => {
        const optimized = String(text || '').trim()
        if (!optimized) throw new Error(globalT('error.noDraft'))
        const facade = inputFacadeFor(sessionId)
        if (!facade || typeof facade.setDraft !== 'function' || typeof facade.submit !== 'function') {
          throw new Error(globalT('error.sendBackend'))
        }
        const before = readComposerState(sessionId)
        const references =
          before && Array.isArray(before.occurrences)
            ? before.occurrences
                .filter((occurrence) => occurrence && typeof occurrence.ref === 'string')
                .map((occurrence) => ({
                  source: occurrence.source || 'reference',
                  ref: occurrence.ref,
                  label: occurrence.label || occurrence.ref,
                  appearance: occurrence.appearance || 'file',
                  clipboardText: occurrence.clipboardText || occurrence.ref,
                }))
            : []
        if (references.length && typeof facade.addFiles !== 'function') {
          throw new Error(globalT('error.referencesRestore'))
        }

        facade.setDraft(optimized)
        await new Promise((resolve) => setTimeout(resolve, 50))
        if (references.length) {
          if (facade.addFiles(references, []) === false) {
            restoreComposerWithReferences(facade, before, references)
            throw new Error(globalT('error.referencesRestore'))
          }
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        let submitted = facade.submit()
        if (submitted && typeof submitted.then === 'function') submitted = await submitted
        if (submitted === false || (submitted && submitted.ok === false)) {
          throw new Error(globalT('error.send'))
        }
        if (typeof facade.notify === 'function') {
          try {
            facade.notify('info', globalT('status.sent'))
          } catch {
            /* 通知失败不阻塞 */
          }
        }
        store.patch(sessionId, message.id, { optimized, sentAt: Date.now() })
        emit()
        return optimized
      }

      const useToast = () => {
        const [toast, setToast] = React.useState(null)
        const timer = React.useRef(null)
        const show = React.useCallback((text, kind) => {
          setToast({ text, kind: kind || 'info', at: Date.now() })
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setToast(null), 2800)
        }, [])
        React.useEffect(
          () => () => {
            if (timer.current) clearTimeout(timer.current)
          },
          []
        )
        return [toast, show]
      }

      const useStoreSnapshot = () => {
        const subscribe = React.useCallback((listener) => store.subscribe(listener), [])
        const getSnapshot = React.useCallback(() => store.get(), [])
        if (typeof React.useSyncExternalStore === 'function') {
          return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
        }
        const [value, setValue] = React.useState(getSnapshot)
        React.useEffect(() => subscribe(() => setValue(getSnapshot())), [subscribe, getSnapshot])
        return value
      }

      const closePanel = (tabId) => {
        const nav = ctx.get('sidebarRight')
        if (nav) {
          if (tabId && typeof nav.close === 'function') {
            try {
              nav.close(tabId)
              return
            } catch (error) {
              console.error('[instruction-optimizer] close(tab) failed', error)
            }
          }
          if (typeof nav.toggleExpanded === 'function') {
            try {
              if (typeof nav.isExpanded !== 'function' || nav.isExpanded()) {
                nav.toggleExpanded()
                return
              }
            } catch (error) {
              console.error('[instruction-optimizer] toggleExpanded failed', error)
            }
          }
        }
        try {
          const layout = ctx.get('layout')
          if (layout && typeof layout.closeRightbar === 'function') {
            layout.closeRightbar()
            return
          }
        } catch (error) {
          console.error('[instruction-optimizer] closeRightbar failed', error)
        }
      }

      function MessageCard(props) {
        const { message, busy, editingId, editText, onEditStart, onEditChange, onEditSave, onEditCancel, onUse, onCopy, onRestoreOriginal, onClarify, canRestore, sending, sendingAny, sentAt, t } = props
        const editing = editingId === message.id
        const sent = Boolean(sentAt)
        const questions = Array.isArray(message.questions) ? message.questions : []
        return React.createElement(
          'div',
          { className: 'io-card' },
          React.createElement(
            'div',
            { className: 'io-card-head' },
            React.createElement(
              'div',
              { className: 'io-card-title' },
              Icon('sparkles', 13),
              React.createElement('span', null, t('card.title'))
            ),
            React.createElement(
              'span',
              { className: 'io-version' },
              t('card.version', { n: message.version || 1 })
            )
          ),
          editing
            ? React.createElement(
                'div',
                { className: 'io-edit-wrap' },
                React.createElement('textarea', {
                  className: 'io-edit',
                  value: editText,
                  onChange: (event) => onEditChange(event.target.value),
                  'aria-label': t('action.edit'),
                }),
                React.createElement(
                  'div',
                  { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
                  React.createElement(
                    'button',
                    { type: 'button', className: 'io-btn io-btn-secondary', onClick: onEditCancel },
                    t('action.cancel')
                  ),
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'io-btn io-btn-primary',
                      onClick: () => onEditSave(message.id, editText),
                      disabled: !String(editText || '').trim(),
                    },
                    t('action.save')
                  )
                )
              )
            : React.createElement('div', { className: 'io-instruction' }, message.optimized || ''),
          questions.length
            ? React.createElement(
                'div',
                { className: 'io-questions' },
                React.createElement('div', { className: 'io-questions-title' }, t('card.questions')),
                questions.map((item, index) =>
                  React.createElement(
                    'div',
                    { className: 'io-question', key: index },
                    React.createElement('div', { className: 'io-question-text' }, item.question),
                    React.createElement(
                      'div',
                      { className: 'io-options' },
                      (Array.isArray(item.options) ? item.options : []).map((option, optionIndex) =>
                        React.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'io-option',
                            key: optionIndex,
                            title: option.value || option.label,
                            disabled: busy || sendingAny || sent,
                            onClick: () => onClarify(message, item.question, option),
                          },
                          option.label
                        )
                      )
                    )
                  )
                )
              )
            : null,
          message.fallback
            ? React.createElement('div', { className: 'io-note' }, t('card.fallback'))
            : null,
          React.createElement(
            'div',
            { className: 'io-actions' },
            sent
              ? React.createElement(
                  'span',
                  { className: 'io-sent' },
                  Icon('check', 13),
                  React.createElement('span', null, t('status.sent'))
                )
              : React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'io-btn io-btn-primary',
                    title: message.fallback ? t('card.fallback') : t('action.useHint'),
                    disabled: busy || sendingAny || !message.optimized || message.fallback,
                    onClick: () => onUse(message, editing ? editText : message.optimized),
                  },
                  Icon('send', 13),
                  React.createElement('span', null, sending ? t('status.optimizing') : t('action.use'))
                ),
            sent
              ? null
              : React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'io-btn io-btn-secondary',
                    disabled: editing || busy || sendingAny,
                    onClick: onEditStart.bind(null, message),
                  },
                  Icon('edit', 13),
                  React.createElement('span', null, t('action.edit'))
                ),
            canRestore
              ? React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'io-btn io-btn-secondary',
                    title: t('action.restoreHint'),
                    disabled: editing || busy || sendingAny,
                    onClick: () => onRestoreOriginal(),
                  },
                  Icon('undo', 13),
                  React.createElement('span', null, t('action.restore'))
                )
              : null,
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'io-btn io-btn-secondary',
                disabled: !message.optimized,
                onClick: () => onCopy(editing ? editText : message.optimized),
              },
              Icon('copy', 13),
              React.createElement('span', null, t('action.copy'))
            )
          )
        )
      }

      function PanelBody(props) {
        const t = typeof props.t === 'function' ? props.t : globalT
        const useTabInfo = props.useTabInfo
        const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : null
        const tabId = tabInfo && tabInfo.tab && typeof tabInfo.tab.id === 'string' ? tabInfo.tab.id : null
        const navigation = tabInfo && tabInfo.tab ? tabInfo.tab.navigation : null
        const params = navigation && navigation.params && typeof navigation.params === 'object' ? navigation.params : null
        const snapshot = useStoreSnapshot()
        const sessionId =
          (typeof props.sessionId === 'string' && props.sessionId) ||
          (params && typeof params.sessionId === 'string' ? params.sessionId : null)
        const conversation = sessionId ? snapshot.bySession[sessionId] : undefined
        const messages = conversation ? conversation.messages : []
        const busy = store.isBusy(sessionId)
        const [draft, setDraft] = React.useState('')
        const [editingId, setEditingId] = React.useState(null)
        const [editText, setEditText] = React.useState('')
        const [sendingId, setSendingId] = React.useState(null)
        const [sentIds, setSentIds] = React.useState(() => new Set())
        const [toast, showToast] = useToast()
        const [clock, setClock] = React.useState(Date.now())
        const bodyRef = React.useRef(null)
        const lastMessage = messages.length ? messages[messages.length - 1] : null

        React.useEffect(() => {
        }, [sessionId])

        React.useEffect(() => {
          if (!sessionId || !params || params.action !== 'optimize') return
          if (typeof params.sessionId === 'string' && params.sessionId && params.sessionId !== sessionId) return
          const draftText = typeof params.draft === 'string' ? params.draft.trim() : ''
          if (!draftText) return
          const nonce = String(params.nonce || navigation?.revision || '')
          if (!nonce) return
          const key = sessionId + ':' + nonce
          if (handledTriggers.has(key)) return
          handledTriggers.add(key)
          if (handledTriggers.size > 120) {
            const first = handledTriggers.values().next().value
            if (first) handledTriggers.delete(first)
          }
          store.start(sessionId, draftText.slice(0, MAX_DRAFT_CHARS))
          setEditingId(null)
          setDraft('')
          void runOptimize(sessionId, { initial: true })
        }, [sessionId, params && params.nonce, params && params.action, navigation && navigation.revision])

        React.useEffect(() => {
          setSentIds(new Set())
        }, [sessionId])

        React.useEffect(() => {
          const body = bodyRef.current
          if (body) body.scrollTop = body.scrollHeight
        }, [messages.length, busy, lastMessage && lastMessage.optimized])

        const sendFeedback = () => {
          const text = draft.trim()
          if (!text || busy || !sessionId) return
          if (!conversation) {
            if (text.length > MAX_DRAFT_CHARS) {
              showToast(t('error.tooLong'), 'error')
              return
            }
            store.start(sessionId, text)
            setDraft('')
            void runOptimize(sessionId, { initial: true })
            return
          }
          if (text.length > MAX_FEEDBACK_CHARS) {
            showToast(t('error.feedbackLong'), 'error')
            return
          }
          setDraft('')
          void runOptimize(sessionId, { feedback: text })
        }

        const startFromDraft = () => {
          const text = draft.trim()
          if (!sessionId) return
          if (!text) {
            showToast(t('error.noDraft'), 'error')
            return
          }
          if (text.length > MAX_DRAFT_CHARS) {
            showToast(t('error.tooLong'), 'error')
            return
          }
          store.start(sessionId, text)
          setDraft('')
          setEditingId(null)
          void runOptimize(sessionId, { initial: true })
        }

        const onKeyDown = (event) => {
          if (event.key !== 'Enter' || event.shiftKey) return
          if (event.nativeEvent && event.nativeEvent.isComposing) return
          event.preventDefault()
          if (!conversation) startFromDraft()
          else sendFeedback()
        }

        const editStart = (message) => {
          setEditingId(message.id)
          setEditText(message.optimized || '')
        }
        const editCancel = () => {
          setEditingId(null)
          setEditText('')
        }
        const editSave = (messageId, text) => {
          const value = String(text || '').trim()
          if (!value) return
          store.patch(sessionId, messageId, { optimized: value, fallback: false, sentAt: 0 })
          setEditingId(null)
          setEditText('')
        }
        const copy = (text) => {
          copyText(String(text || ''))
          showToast(t('toast.copied'))
        }

        React.useEffect(() => {
          if (!busy) return undefined
          setClock(Date.now())
          const timer = setInterval(() => setClock(Date.now()), 1000)
          return () => clearInterval(timer)
        }, [busy])

        const use = async (message, text) => {
          if (!sessionId || sendingId || busy) return
          const value = String(text || '').trim()
          if (!value) return
          if (message.fallback) {
            showToast(t('card.fallback'), 'error')
            return
          }
          const inputState = readComposerState(sessionId)
          const original = String(conversation?.original || '').trim()
          const current = inputState && typeof inputState.draft === 'string' ? inputState.draft.trim() : ''
          if (
            original &&
            current !== original &&
            typeof window.confirm === 'function' &&
            !window.confirm(t('confirm.draftChanged'))
          ) {
            return
          }
          setSendingId(message.id)
          try {
            await useInstruction(sessionId, message, value)
            setSentIds((previous) => new Set(previous).add(message.id))
            showToast(t('toast.sent'))
          } catch (error) {
            showToast(error instanceof Error && error.message ? error.message : t('error.send'), 'error')
          } finally {
            setSendingId(null)
          }
        }

        const restoreOriginal = () => {
          const original = String(conversation?.original || '')
          if (!original) {
            showToast(t('error.noDraft'), 'error')
            return
          }
          const inputState = readComposerState(sessionId)
          const current = inputState && typeof inputState.draft === 'string' ? inputState.draft.trim() : ''
          if (
            original &&
            current !== original &&
            typeof window.confirm === 'function' &&
            !window.confirm(t('confirm.draftChangedRestore'))
          ) {
            return
          }
          const facade = inputFacadeFor(sessionId)
          if (!facade || typeof facade.setDraft !== 'function') {
            showToast(t('error.sendBackend'), 'error')
            return
          }
          const references =
            inputState && Array.isArray(inputState.occurrences)
              ? inputState.occurrences
                  .filter((occurrence) => occurrence && typeof occurrence.ref === 'string')
                  .map((occurrence) => ({
                    source: occurrence.source || 'reference',
                    ref: occurrence.ref,
                    label: occurrence.label || occurrence.ref,
                    appearance: occurrence.appearance || 'file',
                    clipboardText: occurrence.clipboardText || occurrence.ref,
                  }))
              : []
          if (references.length && typeof facade.addFiles !== 'function') {
            showToast(t('error.referencesRestore'), 'error')
            return
          }
          try {
            facade.setDraft(original)
            if (references.length && facade.addFiles(references, []) === false) {
              restoreComposerWithReferences(facade, inputState, references)
              showToast(t('error.referencesRestore'), 'error')
              return
            }
            if (typeof facade.notify === 'function') {
              try {
                facade.notify('info', t('toast.restored'))
              } catch {
                /* 通知失败不影响放回 */
              }
            }
            showToast(t('toast.restored'))
          } catch (error) {
            showToast(error instanceof Error && error.message ? error.message : t('error.send'), 'error')
          }
        }

        const clarify = (message, question, option) => {
          if (!sessionId || busy || sendingId || !question || !option) return
          const label = String(option.label || '').trim()
          const value = String(option.value || '').trim()
          if (!label) return
          const feedback = t('clarify.feedback', {
            question,
            label,
            valueText: value ? `（${value}）` : '',
          })
          showToast(t('toast.clarify'))
          void runOptimize(sessionId, { feedback })
        }

        const retryContext = (message) => {
          if (!sessionId || !message || !message.retryPayload) return
          void runOptimize(sessionId, {
            retry: {
              payload: message.retryPayload,
              pendingId: message.id,
            },
          })
        }

        const cancelContext = (message) => {
          if (!sessionId || !message) return
          store.patch(sessionId, message.id, {
            contextTimeout: false,
            retryPayload: undefined,
            error: t('context.cancelled'),
          })
        }

        const rows = messages.map((message) => {
          if (message.role === 'user') {            return React.createElement(
              'div',
              { className: 'io-msg io-user', key: message.id },
              React.createElement('div', { className: 'io-user-bubble' }, message.text)
            )
          }
          if (message.status === 'pending') {
            const elapsed = message.at ? Math.max(0, Math.floor((clock - message.at) / 1000)) : 0
            return React.createElement(
              'div',
              { className: 'io-msg io-assistant', key: message.id },
              React.createElement(
                'div',
                { className: 'io-pending', role: 'status', 'aria-live': 'polite' },
                React.createElement(
                  'span',
                  { className: 'io-typing' },
                  React.createElement('i'),
                  React.createElement('i'),
                  React.createElement('i')
                ),
                React.createElement('span', null, message.version === 1 ? t('status.understanding') : t('status.optimizing')),
                elapsed > 0
                  ? React.createElement(
                      'span',
                      { className: 'io-elapsed' },
                      t('status.elapsed', { s: elapsed })
                    )
                  : null
              )
            )
          }
          if (message.status === 'error') {
            if (message.contextTimeout) {
              return React.createElement(
                'div',
                { className: 'io-msg io-assistant', key: message.id },
                React.createElement(
                  'div',
                  { className: 'io-error' },
                  React.createElement('div', null, t('context.prompt')),
                  React.createElement(
                    'div',
                    { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
                    React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'io-btn io-btn-primary',
                        disabled: busy || Boolean(sendingId),
                        onClick: () => retryContext(message),
                      },
                      t('context.agree')
                    ),
                    React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'io-btn io-btn-secondary',
                        disabled: busy || Boolean(sendingId),
                        onClick: () => cancelContext(message),
                      },
                      t('context.cancel')
                    )
                  )
                )
              )
            }
            return React.createElement(
              'div',
              { className: 'io-msg io-assistant', key: message.id },
              React.createElement('div', { className: 'io-error' }, message.error || t('error.load'))
            )
          }
          return React.createElement(
            'div',
            { className: 'io-msg io-assistant', key: message.id },
            React.createElement(MessageCard, {
              message,
              busy,
              editingId,
              editText,
              onEditStart: editStart,
              onEditChange: setEditText,
              onEditSave: editSave,
              onEditCancel: editCancel,
              onUse: use,
              onCopy: copy,
              onRestoreOriginal: restoreOriginal,
              onClarify: clarify,
              canRestore: Boolean(conversation && conversation.original) && !message.sentAt && !sentIds.has(message.id),
              sending: sendingId === message.id,
              sendingAny: Boolean(sendingId),
              sentAt: message.sentAt || (sentIds.has(message.id) ? 1 : 0),
              t,
            })
          )
        })

        const content = React.createElement(
          'div',
          { className: 'io-root' },
          React.createElement(
            'header',
            { className: 'io-head' },
            React.createElement('div', { className: 'io-head-mark' }, Icon('sparkles', 16)),
            React.createElement(
              'div',
              { className: 'io-head-text' },
              React.createElement('div', { className: 'io-title' }, t('panel.title')),
              React.createElement('div', { className: 'io-subtitle' }, t('panel.subtitle'))
            ),
            React.createElement(
              'div',
              { className: 'io-head-actions' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'io-new-btn',
                  title: t('action.new'),
                  'aria-label': t('action.new'),
                  disabled: !sessionId,
                  onClick: () => {
                    if (!sessionId) return
                    store.clear(sessionId)
                    setDraft('')
                    setEditingId(null)
                    showToast(t('toast.new'))
                  },
                },
                Icon('refresh', 15),
                React.createElement('span', null, t('action.new'))
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'io-icon',
                  title: t('action.close'),
                  'aria-label': t('action.close'),
                  onClick: () => closePanel(tabId),
                },
                Icon('close', 16)
              )
            )
          ),
          React.createElement(
            'div',
            { className: 'io-body', ref: bodyRef, role: 'log', 'aria-live': 'polite' },
            !conversation
              ? React.createElement(
                  'div',
                  { className: 'io-empty' },
                  React.createElement(
                    'div',
                    { className: 'io-empty-title' },
                    Icon('sparkles', 15),
                    React.createElement('span', { style: { marginLeft: '6px' } }, t('empty.title'))
                  ),
                  React.createElement(
                    'div',
                    { className: 'io-empty-lines' },
                    ['empty.line1', 'empty.line2', 'empty.line3'].map((key) =>
                      React.createElement(
                        'div',
                        { className: 'io-empty-line', key },
                        React.createElement('span', { className: 'io-dot' }),
                        React.createElement('span', null, t(key))
                      )
                    )
                  )
                )
              : rows,
            toast
              ? React.createElement(
                  'div',
                  { className: 'io-toast', 'data-kind': toast.kind },
                  toast.text
                )
              : null
          ),
          React.createElement(
            'div',
            { className: 'io-composer' },
            React.createElement('textarea', {
              className: 'io-textarea',
              rows: conversation ? 2 : 3,
              value: draft,
              placeholder: conversation ? t('input.placeholder') : t('empty.startPlaceholder'),
              disabled: !sessionId || busy,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown,
              'aria-label': conversation ? t('input.placeholder') : t('empty.startPlaceholder'),
            }),
            React.createElement(
              'div',
              { className: 'io-composer-row' },
              React.createElement(
                'span',
                { className: 'io-hint' },
                busy ? t('status.thinking') : t('input.hint')
              ),
              busy
                ? React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'io-btn io-btn-secondary',
                      onClick: () => stopRun(sessionId),
                    },
                    Icon('stop', 13),
                    React.createElement('span', null, t('action.stop'))
                  )
                : React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'io-btn io-btn-primary',
                      disabled: !sessionId || !draft.trim(),
                      onClick: conversation ? sendFeedback : startFromDraft,
                    },
                    Icon(conversation ? 'send' : 'sparkles', 13),
                    React.createElement('span', null, conversation ? t('action.feedback') : t('action.start'))
                  )
            )
          )
        )

        return React.createElement(
          'div',
          { className: 'io-anchor' },
          content
        )
      }

      function ComposerTrigger(props) {
        const t = typeof props.t === 'function' ? props.t : globalT
        const sessionId = typeof props.sessionId === 'string' ? props.sessionId : null
        const useInput = props.useInput
        const draft = typeof useInput === 'function' ? useInput((input) => (input && input.draft) || '') : ''
        const hasReferences =
          typeof useInput === 'function'
            ? useInput((input) => Boolean(input && Array.isArray(input.occurrences) && input.occurrences.length > 0))
            : false
        const attachmentCount =
          typeof useInput === 'function'
            ? useInput((input) => (input && Array.isArray(input.attachmentIds) ? input.attachmentIds.length : 0))
            : 0
        const referenceCount =
          typeof useInput === 'function'
            ? useInput((input) => (input && Array.isArray(input.occurrences) ? input.occurrences.length : 0))
            : 0
        const label = t('trigger.label')
        const title = label + ' — ' + (hasReferences ? t('trigger.keepReferences') : t('trigger.hint'))
        return React.createElement(
          'button',
          {
            type: 'button',
            className: 'io-trigger',
            title,
            'aria-label': hasReferences ? title : label,
            disabled: !sessionId,
            onClick: () => {
              if (!sessionId) return
              const open = async () => {
                const text = String(draft || '').trim()
                const nav = ctx.get('sidebarRight')
                if (!nav || typeof nav.openTab !== 'function') {
                  console.error('[instruction-optimizer] right sidebar service unavailable')
                  return
                }
                const clipped = text.slice(0, MAX_DRAFT_CHARS)
                try {
                  nav.openTab(TAB_KIND, {
                    params: {
                      action: clipped ? 'optimize' : 'open',
                      draft: clipped,
                      sessionId,
                      nonce: Date.now() + ':' + Math.random().toString(36).slice(2, 8),
                    },
                  })
                } catch (error) {
                  console.error('[instruction-optimizer] cannot open tab', error)
                }
              }
              void open()
            },
          },
          Icon('sparkles', 14),
          React.createElement('span', null, t('trigger.label'))
        )
      }

      const wire = (scope) => {
        const tabs = scope.get('sidebarRightTabs')
        if (!tabs || typeof tabs.register !== 'function') {
          console.error('[instruction-optimizer] right sidebar tab registry unavailable')
          return
        }

        scope.effect(() =>
          tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            priority: 'extension',
            keepMounted: true,
            title: () => globalT('panel.title'),
            guide: [
              {
                id: 'instruction-optimizer',
                order: 42,
                title: () => globalT('guide.title'),
                description: () => globalT('guide.description'),
              },
            ],
          })
        )

        scope.slots.inject('sidebar.right.pane.tab', () =>
          scope.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, PanelBody)
        )

        scope.slots.inject('conversation.input.right', () =>
          scope.slots.register(
            {
              name: 'conversation.input.right',
              id: 'instruction-optimizer-trigger',
              order: 20,
              label: () => globalT('trigger.label'),
              locale: NS,
            },
            ComposerTrigger
          )
        )

        // 三个内部命令不在会话里留下指令行。
        for (const key of INTERNAL_COMMANDS) {
          scope.slots.inject('conversation.chat.commandview', () =>
            scope.slots.register({ name: 'conversation.chat.commandview', key }, () => null)
          )
        }
      }

      if (typeof ctx.inject === 'function') {
        ctx.inject(['sidebarRightTabs', 'sidebarRight'], wire)
      } else {
        wire(ctx)
      }

      ctx.effect(() => () => {
        for (const run of runs.values()) {
          try {
            run.controller.abort()
          } catch {
            /* 忽略 */
          }
        }
        runs.clear()
        store.flush()
      })
    }

    const inject = ['slots', 'locale', 'remote', 'remote.commands']
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
