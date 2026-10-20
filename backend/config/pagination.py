from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default page size from settings; clients may ask for up to 50 per page."""

    page_size_query_param = 'page_size'
    max_page_size = 50
