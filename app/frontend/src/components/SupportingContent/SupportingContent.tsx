import { useEffect, useMemo, useState } from "react";

import { parseSupportingContentItem } from "./SupportingContentParser";

import styles from "./SupportingContent.module.css";

interface Props {
    supportingContent: string[] | { text: string[]; images?: string[] };
}

export const SupportingContent = ({ supportingContent }: Props) => {
    const textItems = Array.isArray(supportingContent) ? supportingContent : supportingContent.text;
    const imageItems = !Array.isArray(supportingContent) ? supportingContent?.images : [];
    const parsedTextItems = useMemo(() => textItems.map(item => parseSupportingContentItem(item)), [textItems]);
    const [citationLinks, setCitationLinks] = useState<Record<string, string | null>>({});

    useEffect(() => {
        const controller = new AbortController();

        const loadCitationLinks = async () => {
            const citationFiles = Array.from(
                new Set(
                    parsedTextItems
                        .map(item => item.title)
                        .filter(title => title.toLowerCase().endsWith(".json"))
                )
            );

            if (!citationFiles.length) {
                setCitationLinks({});
                return;
            }

            setCitationLinks({});

            const entries = await Promise.all(
                citationFiles.map(async fileName => {
                    try {
                        const response = await fetch(fileName, { signal: controller.signal });
                        if (!response.ok) {
                            throw new Error(`Failed to fetch citation file: ${response.status}`);
                        }

                        const { url } = (await response.json()) as { url: string };
                        return [fileName, url] as const;
                    } catch (error) {
                        if ((error as Error).name !== "AbortError") {
                            console.error(`Unable to load citation link for ${fileName}`, error);
                        }
                        return [fileName, null] as const;
                    }
                })
            );

            if (!controller.signal.aborted) {
                setCitationLinks(Object.fromEntries(entries));
            }
        };

        loadCitationLinks();

        return () => {
            controller.abort();
        };
    }, [parsedTextItems]);

    return (
        <ul className={styles.supportingContentNavList}>
            {parsedTextItems.map((parsed, ind) => {
                const citationUrl = citationLinks[parsed.title];
                return (
                    <li className={styles.supportingContentItem} key={`supporting-content-text-${ind}`}>
                        <h4 className={styles.supportingContentItemHeader}>
                            {citationUrl ? (
                                <a href={citationUrl} target="_blank" rel="noopener noreferrer">
                                    {parsed.title}
                                </a>
                            ) : (
                                parsed.title
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
