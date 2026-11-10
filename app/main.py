"""DecisionDesk Streamlit application home page."""

import streamlit as st


def main() -> None:
    """Render the DecisionDesk landing page."""
    st.set_page_config(page_title="DecisionDesk", layout="wide")
    st.title("DecisionDesk")
    st.write(
        "DecisionDesk helps marketplace operations teams understand late deliveries "
        "and compare delivery and seller policies before spending money. It uses "
        "observed marketplace data and clearly labelled assumptions to estimate "
        "scenario outcomes."
    )
    st.info("Use the pages in the sidebar to explore and compare policies.")


main()
