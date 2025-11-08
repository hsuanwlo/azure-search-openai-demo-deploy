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

        const rawDisplay = (entry as any).display_text;
        const rawPath = (entry as any).path;

        const display = typeof rawDisplay === "string" ? rawDisplay : undefined;
        const path = typeof rawPath === "string" ? rawPath : undefined;

        if (display) {
            citationPathMap.set(display, path || display);
        } else if (path) {
            citationPathMap.set(path, path);
        }
    });

    const possibleCitations = Array.from(citationPathMap.keys()).filter(
        (citationKey): citationKey is string => typeof citationKey === "string" && citationKey.length > 0
    );
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

            const normalizedPart = part.trim();
            const matchingCitation = possibleCitations.find(citation => {
                return citation.startsWith(normalizedPart) || normalizedPart.startsWith(citation);
            });

            if (!matchingCitation) {
                return `[${part}]`;
            }

            const citationLabel = normalizedPart || part;

            if (citations.indexOf(citationLabel) !== -1) {
                citationIndex = citations.indexOf(citationLabel) + 1;
            } else {
                citations.push(citationLabel);
                citationIndex = citations.length;
            }

            const targetPath = citationPathMap.get(matchingCitation);

            if (!targetPath) {
                return `[${part}]`;
            }

            citationPaths[citationLabel] = targetPath;
            const backendPath = getCitationFilePath(targetPath);

            return renderToStaticMarkup(
                <a className="supContainer" title={citationLabel} onClick={() => onCitationClicked(backendPath)}>
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
