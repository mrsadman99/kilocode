import { IDE } from "../.."
import { getRangeInString } from "../../util/ranges"
import { languageForFilepath, languageForId } from "../constants/AutocompleteLanguageInfo"
import { AutocompleteInput } from "../util/types"

/**
 * We have to handle a few edge cases in getting the entire prefix/suffix for the current file.
 * This is entirely prior to finding snippets from other files
 */
export async function constructInitialPrefixSuffix(
  input: AutocompleteInput,
  ide: IDE,
): Promise<{
  prefix: string
  suffix: string
}> {
  const lang = (input.languageId && languageForId(input.languageId)) || languageForFilepath(input.filepath)

  const inject = (prefix: string) => {
    if (!input.injectDetails) return prefix
    const lines = prefix.split("\n")
    return `${lines.slice(0, -1).join("\n")}\n${lang.singleLineComment} ${input.injectDetails
      .split("\n")
      .join(`\n${lang.singleLineComment} `)}\n${lines[lines.length - 1]}`
  }

  if (
    input.manuallyPassFileContents == null &&
    input.selectedCompletionInfo == null &&
    input.manuallyPassPrefix != null &&
    input.manuallyPassSuffix != null
  ) {
    return { prefix: inject(input.manuallyPassPrefix), suffix: input.manuallyPassSuffix }
  }

  const fileContents = input.manuallyPassFileContents ?? (await ide.readFile(input.filepath))
  const fileLines = fileContents.split("\n")
  const prefix = inject(
    getRangeInString(fileContents, {
      start: { line: 0, character: 0 },
      end: input.selectedCompletionInfo?.range.start ?? input.pos,
    }) + (input.selectedCompletionInfo?.text ?? ""),
  )

  const suffix = getRangeInString(fileContents, {
    start: input.pos,
    end: { line: fileLines.length - 1, character: Number.MAX_SAFE_INTEGER },
  })

  return { prefix, suffix }
}
