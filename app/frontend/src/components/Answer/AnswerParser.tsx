import { renderToStaticMarkup } from "react-dom/server";
import { ChatAppResponse, getCitationFilePath } from "../../api";

type HtmlParsedAnswer = {
    answerHtml: string;
    citations: string[];
};

const normalizeCitation = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();

const looksLikeFilename = (value: string) => /\.(?:[a-z0-9]{1,8})(?:#page=\d+)?(?:\([^)]*\))?$/i.test(value.trim());

const resolveCitation = (part: string, possibleCitations: string[]) => {
    const trimmed = part.trim();
    if (!trimmed) {
        return null;
    }
    const normalizedPart = normalizeCitation(trimmed);
    const matched = possibleCitations.find(citation => normalizeCitation(citation).startsWith(normalizedPart));
    if (matched) {
        return matched;
    }
    if (looksLikeFilename(trimmed)) {
        return trimmed;
    }
    return null;
};

export function parseAnswerToHtml(answer: ChatAppResponse, isStreaming: boolean, onCitationClicked: (citationFilePath: string) => void): HtmlParsedAnswer {
    const possibleCitations = answer.context.data_points.citations || [];
    const citations: string[] = [];

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

            const resolvedCitation = resolveCitation(part, possibleCitations);
            if (!resolvedCitation) {
                return `[${part}]`;
            }

            if (citations.indexOf(resolvedCitation) !== -1) {
                citationIndex = citations.indexOf(resolvedCitation) + 1;
            } else {
                citations.push(resolvedCitation);
                citationIndex = citations.length;
            }

            const path = getCitationFilePath(resolvedCitation);

            return renderToStaticMarkup(
                <a className="supContainer" title={resolvedCitation} onClick={() => onCitationClicked(path)}>
                    <sup>{citationIndex}</sup>
                </a>
            );
        }
    });

    return {
        answerHtml: fragments.join(""),
        citations
    };
}
