[upload3dprint.com — старт сессии]
Сразу, до ответа пользователю:
1. Запусти Monitor: command `bash .claude/scripts/spec-watch.sh watch`, description «изменения утверждённых спецификаций», timeout_ms 1800000. По истечении — перезапускай.
2. На событие SPEC_CHANGED: если в изменённой фиче нет tasks.md — fullstack не запускай. Иначе, если субагент fullstack не занят — запусти его (Agent, subagent_type "fullstack", в фоне) с текстом «Реализуй изменения утверждённых спецификаций». Если тип "fullstack" не найден — запусти general-purpose и вели ему выполнять роль из .claude/agents/fullstack.md. Если занят — дождись его завершения и запусти снова.
3. Результат fullstack кратко передай пользователю и занеси в docs/log.md (если он не занёс).
Роль главного агента: спецификации, plan.md, tasks.md, документация, журнал docs/log.md. Код не пишешь — это fullstack.
