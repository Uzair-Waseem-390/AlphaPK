from django.urls import path

from .views import (
    CategoryListCreateView,
    CategoryRetrieveUpdateDestroyView,
    InventoryListView,
    InventoryRetrieveView,
    ProductListCreateView,
    ProductRetrieveUpdateDestroyView,
    PurchaseListCreateView,
    PurchaseRetrieveUpdateDestroyView,
    ShelfListCreateView,
    ShelfRetrieveUpdateDestroyView,
    SupplierListCreateView,
    SupplierRetrieveUpdateDestroyView,
)

urlpatterns = [
    # Categories
    path("categories/", CategoryListCreateView.as_view(), name="category-list-create"),
    path("categories/<int:pk>/", CategoryRetrieveUpdateDestroyView.as_view(), name="category-detail"),

    # Shelves
    path("shelves/", ShelfListCreateView.as_view(), name="shelf-list-create"),
    path("shelves/<int:pk>/", ShelfRetrieveUpdateDestroyView.as_view(), name="shelf-detail"),

    # Suppliers
    path("suppliers/", SupplierListCreateView.as_view(), name="supplier-list-create"),
    path("suppliers/<int:pk>/", SupplierRetrieveUpdateDestroyView.as_view(), name="supplier-detail"),

    # Products
    path("products/", ProductListCreateView.as_view(), name="product-list-create"),
    path("products/<int:pk>/", ProductRetrieveUpdateDestroyView.as_view(), name="product-detail"),

    # Purchases
    path("purchases/", PurchaseListCreateView.as_view(), name="purchase-list-create"),
    path("purchases/<int:pk>/", PurchaseRetrieveUpdateDestroyView.as_view(), name="purchase-detail"),

    # Inventory (read-only from views perspective)
    path("inventory/", InventoryListView.as_view(), name="inventory-list"),
    path("inventory/<int:product_id>/", InventoryRetrieveView.as_view(), name="inventory-detail"),
]