import { BOARD_DEFAULT_AVATAR } from '../../../presenters/message-board-presenter'
Component({
  options: { multipleSlots: true },
  properties: {
    nickName: String,
    avatarFileId: String,
    serverName: String,
    body: String,
    createdLabel: String,
    statusLabel: String,
    safetyLabel: String,
    reason: String,
    replyText: String,
    replyLabel: String,
  },
  data: {
    expanded: false,
    avatarFailed: false,
    canExpand: false,
    defaultAvatar: BOARD_DEFAULT_AVATAR,
  },
  observers: {
    body(value: string) {
      this.setData({
        expanded: false,
        canExpand: Array.from(value || '').length > 140 || (value || '').split('\n').length > 6,
      })
    },
    avatarFileId() {
      this.setData({ avatarFailed: false })
    },
  },
  methods: {
    onToggle() {
      this.setData({ expanded: !this.data.expanded })
    },
    onAvatarError() {
      this.setData({ avatarFailed: true })
    },
  },
})
