from django.urls import path
from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("me/", views.MeView.as_view(), name="me"),
    path("workspaces/", views.WorkspaceListCreateView.as_view(), name="workspace-list"),
    path(
        "workspaces/<int:pk>/",
        views.WorkspaceDetailView.as_view(),
        name="workspace-detail",
    ),
    path(
        "workspaces/<int:workspace_id>/members/",
        views.WorkspaceMemberListView.as_view(),
        name="workspace-members",
    ),
    path(
        "workspaces/<int:workspace_id>/members/<int:member_id>/",
        views.WorkspaceMemberDetailView.as_view(),
        name="workspace-member-detail",
    ),
]
