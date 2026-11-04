#!/usr/bin/env bash
# Наблюдатель утверждённых спецификаций.
# Учитываются только specs/<фича>/, где в spec.md стоит «**Статус:** утверждена».
# Снимок последней реализованной версии — .claude/state/snapshot/.
#   diff  — что изменилось с последней реализации (unified diff)
#   sync  — зафиксировать текущие утверждённые спеки как реализованные
#   watch — раз в 60 с печатать «SPEC_CHANGED: <файлы>» при новом изменении
cd "$(dirname "$0")/../.." || exit 1
SNAP=.claude/state/snapshot

approved() {
  for d in specs/*/; do
    grep -qs '^\*\*Статус:\*\* утверждена' "${d}spec.md" && echo "${d%/}"
  done
}

case "$1" in
  diff)
    for d in $(approved); do mkdir -p "$SNAP/$d"; diff -ruN "$SNAP/$d" "$d"; done ;;
  sync)
    for d in $(approved); do rm -rf "$SNAP/$d"; mkdir -p "$SNAP/$d"; cp -r "$d/." "$SNAP/$d/"; done ;;
  watch)
    last=""
    while true; do
      cur=$("$0" diff 2>/dev/null)
      sum=$(printf '%s' "$cur" | sha1sum)
      if [ -n "$cur" ] && [ "$sum" != "$last" ]; then
        echo "SPEC_CHANGED: $(printf '%s\n' "$cur" | sed -n 's/^+++ \([^\t]*\).*/\1/p' | tr '\n' ' ')"
      fi
      last=$sum
      sleep 60
    done ;;
  *) echo "usage: $0 diff|sync|watch" >&2; exit 2 ;;
esac
