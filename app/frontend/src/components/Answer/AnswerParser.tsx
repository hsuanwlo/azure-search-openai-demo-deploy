import { renderToStaticMarkup } from "react-dom/server";
import { ChatAppResponse, getCitationFilePath } from "../../api";

type HtmlParsedAnswer = {
    answerHtml: string;
    citations: string[];
    citationPaths: Record<string, string>;
};

export function parseAnswerToHtml(answer: ChatAppResponse, isStreaming: boolean, onCitationClicked: (citationFilePath: string) => void): HtmlParsedAnswer {
    const citationEntries = answer.context.data_points?.citations || [];
    const citationPathMap = new Map<string, string>();

    citationEntries.forEach(entry => {
        if (!entry) {
            return;
        }

        if (typeof entry === "string") {
            citationPathMap.set(entry, entry);
            return;
        }

        const display = (entry as any).display_text ?? "";
        const path = (entry as any).path ?? "";

        if (display) {
            citationPathMap.set(display, path || display);
        } else if (path) {
            citationPathMap.set(path, path);
        }
    });

    const possibleCitations = Array.from(citationPathMap.keys());
    const citations: string[] = [];
    const citationPaths: Record<string, string> = {};

    // Trim any whitespace from the end of the answer after removing follow-up questions
    let parsedAnswer = answer.message.content.trim();

    // Omit a citation that is still being typed during streaming
    if (isStreaming) {
        let lastIndex = parsedAnswer.length;
        for (let i = parsedAnswer.length - 1; i >= 0; i--) {
            if (parsedAnswer[i] === "]") {
                break;
            } else if (parsedAnswer[i] === "[") {
                lastIndex = i;
                break;
            }
        }
        const truncatedAnswer = parsedAnswer.substring(0, lastIndex);
        parsedAnswer = truncatedAnswer;
    }

    const parts = parsedAnswer.split(/\[([^\]]+)\]/g);

    const fragments: string[] = parts.map((part, index) => {
        if (index % 2 === 0) {
            return part;
        } else {
            let citationIndex: number;

            const isValidCitation = possibleCitations.some(citation => {
                return citation.startsWith(part);
            });

            if (!isValidCitation) {
                return `[${part}]`;
            }

            if (citations.indexOf(part) !== -1) {
                citationIndex = citations.indexOf(part) + 1;
            } else {
                citations.push(part);
                citationIndex = citations.length;
            }

            const targetPath = citationPathMap.get(part);

            if (!targetPath) {
                return `[${part}]`;
            }

            citationPaths[part] = targetPath;
            const backendPath = getCitationFilePath(targetPath);

            return renderToStaticMarkup(
                <a className="supContainer" title={part} onClick={() => onCitationClicked(backendPath)}>
                    <sup>{citationIndex}</sup>
                </a>
            );
        }
    });

    return {
        answerHtml: fragments.join(""),
        citations,
        citationPaths
    };
}
