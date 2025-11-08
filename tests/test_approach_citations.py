from approaches.approach import Approach, Citation


def _create_approach() -> Approach:
    return object.__new__(Approach)  # type: ignore[call-arg]


def test_get_citation_sanitizes_json_source_name():
    approach = _create_approach()

    citation = approach.get_citation("Json_Yamaha_FAQ.json", "Json_Yamaha_FAQ.json")

    assert isinstance(citation, Citation)
    assert citation.display_text == "Yamaha FAQ"
    assert citation.path == "Json_Yamaha_FAQ.json"


def test_get_citation_includes_pdf_page_fragment():
    approach = _create_approach()

    citation = approach.get_citation("PolicyGuide.pdf#page=2", "PolicyGuide.pdf")

    assert citation.display_text == "Policy Guide (Page 2)"
    assert citation.path == "PolicyGuide.pdf#page=2"


def test_get_citation_prefers_sourcefile_when_no_sourcepage():
    approach = _create_approach()

    citation = approach.get_citation(None, "folder/benefits-guide.docx")

    assert citation.display_text == "Benefits Guide"
    assert citation.path == "folder/benefits-guide.docx"


def test_get_citation_handles_numeric_filenames():
    approach = _create_approach()

    citation = approach.get_citation("2189.json", "2189.json")

    assert citation.display_text == "2189"
    assert citation.path == "2189.json"


def test_get_image_citation_appends_filename():
    approach = _create_approach()

    citation = approach.get_image_citation(
        "PolicyGuide.pdf#page=2",
        "https://contoso.blob.core.windows.net/docs/policyguide-page2.png",
        "PolicyGuide.pdf",
    )

    assert citation.display_text == "Policy Guide (Page 2) (policyguide-page2.png)"
    assert citation.path == "PolicyGuide.pdf#page=2"
