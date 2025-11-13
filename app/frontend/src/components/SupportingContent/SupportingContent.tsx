import { useEffect, useMemo, useState } from "react";

import { getCitationFilePath } from "../../api";
import { parseSupportingContentItem } from "./SupportingContentParser";

import styles from "./SupportingContent.module.css";

interface DataPointsContent {
    text: string[];
    images?: string[];
    citations?: string[];
}

interface Props {
    supportingContent: string[] | DataPointsContent;
}

export const SupportingContent = ({ supportingContent }: Props) => {
    const textItems = Array.isArray(supportingContent) ? supportingContent : supportingContent.text;
    const imageItems = !Array.isArray(supportingContent) ? supportingContent?.images : [];
    const citationFileNames = useMemo<string[]>(() => {
        if (Array.isArray(supportingContent)) {
            return [];
        }

        const citations = supportingContent?.citations ?? [];
        const trimmedJsonFiles = citations
            .map(citation => citation.trim())
            .filter(Boolean)
            .filter(citation => citation.toLowerCase().endsWith(".json"));

        return Array.from(new Set(trimmedJsonFiles));
    }, [supportingContent]);
    const parsedTextItems = useMemo(() => textItems.map(item => parseSupportingContentItem(item)), [textItems]);
    const [citationLinks, setCitationLinks] = useState<Record<string, string | null>>({});

    useEffect(() => {
        if (!citationFileNames.length) {
            setCitationLinks({});
            return;
        }

        let isCancelled = false;
        setCitationLinks({});

        const loadCitationLinks = async () => {
            const entries = await Promise.all(
                citationFileNames.map(async fileName => {
                    try {
                        const response = await fetch(getCitationFilePath(fileName));
                        if (!response.ok) {
                            return [fileName, null] as const;
                        }

                        const { url } = (await response.json()) as { url: string };
                        return [fileName, url.trim()] as const;
                    } catch (error) {
                        console.error(`Unable to load citation link for ${fileName}`, error);
                        return [fileName, null] as const;
                    }
                })
            );

            if (!isCancelled) {
                setCitationLinks(Object.fromEntries(entries));
            }
        };

        loadCitationLinks();

        return () => {
            isCancelled = true;
        };
    }, [citationFileNames]);

    return (
        <ul className={styles.supportingContentNavList}>
            {parsedTextItems.map((parsed, ind) => {
                const title = parsed.title.trim();
                const citationUrl = citationLinks[title];
                const isJsonCitation = citationFileNames.includes(title);
                return (
                    <li className={styles.supportingContentItem} key={`supporting-content-text-${ind}`}>
                        <h4 className={styles.supportingContentItemHeader}>
                            {isJsonCitation ? (
                                citationUrl === undefined ? (
                                    <span>{parsed.title} (loading link…)</span>
                                ) : citationUrl === null ? (
                                    <span>{parsed.title} (link unavailable)</span>
                                ) : (
                                    <a href={citationUrl} target="_blank" rel="noopener noreferrer">
                                        {parsed.title}
                                    </a>
                                )
                            ) : (
                                <span>{parsed.title}</span>
                            )}
                        </h4>
                        <p className={styles.supportingContentItemText} dangerouslySetInnerHTML={{ __html: parsed.content }} />
                    </li>
                );
            })}
            {imageItems?.map((img, ind) => {
                return (
                    <li className={styles.supportingContentItem} key={`supporting-content-image-${ind}`}>
                        <img className={styles.supportingContentItemImage} src={img} />
                    </li>
                );
            })}
        </ul>
    );
};
