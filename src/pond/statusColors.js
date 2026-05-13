export const STATUS_COLORS = {
  active:   '#9FE1CB',
  paused:   '#8a9690',
  archival: '#5d6760',
}

export function colorForStatus(status) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.active
}
