export const localUpdateQuitFlag = '--noblesse-local-update-quit'

export const shouldQuitForLocalUpdate = ({ commandLine, isPackaged }) => (
  isPackaged === true
  && Array.isArray(commandLine)
  && commandLine.some((argument) => argument === localUpdateQuitFlag)
)
