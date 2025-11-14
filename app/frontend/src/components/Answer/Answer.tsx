import { useMemo, useState, useEffect, useCallback, MouseEvent, useRef } from "react";
import { Stack, IconButton } from "@fluentui/react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import styles from "./Answer.module.css";
import { ChatAppResponse, getCitationFilePath, SpeechConfig, getHeaders } from "../../api";
import { parseAnswerToHtml } from "./AnswerParser";
import { AnswerIcon } from "./AnswerIcon";
import { SpeechOutputBrowser } from "./SpeechOutputBrowser";
import { SpeechOutputAzure } from "./SpeechOutputAzure";
import { useMsal } from "@azure/msal-react";
import { useLogin, getToken } from "../../authConfig";

interface Props {
    answer: ChatAppResponse;
    index: number;
    speechConfig: SpeechConfig;
    isSelected?: boolean;
    isStreaming: boolean;
    onCitationClicked: (filePath: string) => void;
    onThoughtProcessClicked: () => void;
    onSupportingContentClicked: () => void;
    onFollowupQuestionClicked?: (question: string) => void;
    showFollowupQuestions?: boolean;
    showSpeechOutputBrowser?: boolean;
    showSpeechOutputAzure?: boolean;
}

export const Answer = ({
    answer,
    index,
    speechConfig,
    isSelected,
    isStreaming,
    onCitationClicked,
    onThoughtProcessClicked,
    onSupportingContentClicked,
    onFollowupQuestionClicked,
    showFollowupQuestions,
    showSpeechOutputAzure,
    showSpeechOutputBrowser
}: Props) => {
    const client = useLogin ? useMsal().instance : undefined;
    const followupQuestions = answer.context?.followup_questions;
    const [citationTargets, setCitationTargets] = useState<Record<string, string>>({});
    const citationTargetsRef = useRef<Record<string, string>>({});
    const citationKeyRef = useRef<string>("");
    const handleCitationSupClick = useCallback(
        (filePath: string) => {
            const resolvedUrl = citationTargetsRef.current[filePath];
            if (resolvedUrl) {
                window.open(resolvedUrl, "_blank", "noopener,noreferrer");
                return;
            }

            onCitationClicked(filePath);
        },
        [onCitationClicked]
    );
    const parsedAnswer = useMemo(
        () => parseAnswerToHtml(answer, isStreaming, handleCitationSupClick),
        [answer, isStreaming, handleCitationSupClick]
    );
    const citationsWithPaths = useMemo(
        () =>
            parsedAnswer.citations.map(citation => ({
                citation,
                path: getCitationFilePath(citation)
            })),
        [parsedAnswer.citations]
    );
    const { t } = useTranslation();
    const sanitizedAnswerHtml = DOMPurify.sanitize(parsedAnswer.answerHtml);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let isActive = true;

        const resetCitationTargets = () => {
            if (Object.keys(citationTargetsRef.current).length > 0) {
                citationTargetsRef.current = {};
                setCitationTargets({});
            }
        };

        const resolveCitationUrls = async () => {
            const currentKey = citationsWithPaths.map(({ path }) => path).join("|");
            if (currentKey === citationKeyRef.current && currentKey !== "") {
                return;
            }

            if (!citationsWithPaths.length) {
                if (isActive) {
                    resetCitationTargets();
                }
                citationKeyRef.current = currentKey;
                return;
            }

            const jsonCitations = citationsWithPaths.filter(({ path }) => path.toLowerCase().endsWith(".json"));
            if (!jsonCitations.length) {
                if (isActive) {
                    resetCitationTargets();
                }
                citationKeyRef.current = currentKey;
                return;
            }

            try {
                const token = client ? await getToken(client) : undefined;
                const headers = await getHeaders(token);
                const resolvedTargets: Record<string, string> = {};

                await Promise.all(
                    jsonCitations.map(async ({ path }) => {
                        try {
                            const response = await fetch(path, { headers });
                            if (!response.ok) {
                                return;
                            }

                            const citationDetails = await response.json();
                            const resolvedUrl = citationDetails?.url;
                            if (typeof resolvedUrl === "string" && resolvedUrl.length > 0) {
                                resolvedTargets[path] = resolvedUrl;
                            }
                        } catch (error) {
                            console.warn(`Failed to resolve citation URL for ${path}`, error);
                        }
                    })
                );

                if (isActive) {
                    const previous = citationTargetsRef.current;
                    const previousKeys = Object.keys(previous);
                    const nextKeys = Object.keys(resolvedTargets);
                    const hasDifferentLength = previousKeys.length !== nextKeys.length;
                    const hasChanged =
                        hasDifferentLength || previousKeys.some(key => previous[key] !== resolvedTargets[key]);

                    if (hasChanged) {
                        citationTargetsRef.current = resolvedTargets;
                        setCitationTargets(resolvedTargets);
                    }
                    citationKeyRef.current = currentKey;
                }
            } catch (error) {
                console.warn("Unable to resolve citation URLs", error);
                if (isActive) {
                    resetCitationTargets();
                }
                citationKeyRef.current = currentKey;
            }
        };

        resolveCitationUrls();

        return () => {
            isActive = false;
        };
    }, [citationsWithPaths, client]);

    const handleCopy = () => {
        // Single replace to remove all HTML tags to remove the citations
        const textToCopy = sanitizedAnswerHtml.replace(/<a [^>]*><sup>\d+<\/sup><\/a>|<[^>]+>/g, "");

        navigator.clipboard
            .writeText(textToCopy)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(err => console.error("Failed to copy text: ", err));
    };

    return (
        <Stack className={`${styles.answerContainer} ${isSelected && styles.selected}`} verticalAlign="space-between">
            <Stack.Item>
                <Stack horizontal horizontalAlign="space-between">
                    <AnswerIcon />
                    <div>
                        <IconButton
                            style={{ color: "black" }}
                            iconProps={{ iconName: copied ? "CheckMark" : "Copy" }}
                            title={copied ? t("tooltips.copied") : t("tooltips.copy")}
                            ariaLabel={copied ? t("tooltips.copied") : t("tooltips.copy")}
                            onClick={handleCopy}
                        />
                        <IconButton
                            style={{ color: "black" }}
                            iconProps={{ iconName: "Lightbulb" }}
                            title={t("tooltips.showThoughtProcess")}
                            ariaLabel={t("tooltips.showThoughtProcess")}
                            onClick={() => onThoughtProcessClicked()}
                            disabled={!answer.context.thoughts?.length || isStreaming}
                        />
                        <IconButton
                            style={{ color: "black" }}
                            iconProps={{ iconName: "ClipboardList" }}
                            title={t("tooltips.showSupportingContent")}
                            ariaLabel={t("tooltips.showSupportingContent")}
                            onClick={() => onSupportingContentClicked()}
                            disabled={!answer.context.data_points || isStreaming}
                        />
                        {showSpeechOutputAzure && (
                            <SpeechOutputAzure answer={sanitizedAnswerHtml} index={index} speechConfig={speechConfig} isStreaming={isStreaming} />
                        )}
                        {showSpeechOutputBrowser && <SpeechOutputBrowser answer={sanitizedAnswerHtml} />}
                    </div>
                </Stack>
            </Stack.Item>

            <Stack.Item grow>
                <div className={styles.answerText}>
                    <ReactMarkdown children={sanitizedAnswerHtml} rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]} />
                </div>
            </Stack.Item>

            {!!parsedAnswer.citations.length && (
                <Stack.Item>
                    <Stack horizontal wrap tokens={{ childrenGap: 5 }}>
                        <span className={styles.citationLearnMore}>{t("citationWithColon")}</span>
                        {citationsWithPaths.map(({ citation, path }, index) => {
                            const resolvedUrl = citationTargets[path];
                            const displayText = resolvedUrl ?? citation;
                            const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
                                event.preventDefault();
                                if (resolvedUrl) {
                                    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
                                    return;
                                }

                                onCitationClicked(path);
                            };

                            return (
                                <a
                                    key={`${citation}-${index}`}
                                    className={styles.citation}
                                    title={displayText}
                                    href={resolvedUrl ?? "#"}
                                    target={resolvedUrl ? "_blank" : undefined}
                                    rel={resolvedUrl ? "noreferrer" : undefined}
                                    onClick={handleClick}
                                >
                                    {`${index + 1}. ${displayText}`}
                                </a>
                            );
                        })}
                    </Stack>
                </Stack.Item>
            )}

            {!!followupQuestions?.length && showFollowupQuestions && onFollowupQuestionClicked && (
                <Stack.Item>
                    <Stack horizontal wrap className={`${!!parsedAnswer.citations.length ? styles.followupQuestionsList : ""}`} tokens={{ childrenGap: 6 }}>
                        <span className={styles.followupQuestionLearnMore}>{t("followupQuestions")}</span>
                        {followupQuestions.map((x, i) => {
                            return (
                                <a key={i} className={styles.followupQuestion} title={x} onClick={() => onFollowupQuestionClicked(x)}>
                                    {`${x}`}
                                </a>
                            );
                        })}
                    </Stack>
                </Stack.Item>
            )}
        </Stack>
    );
};
