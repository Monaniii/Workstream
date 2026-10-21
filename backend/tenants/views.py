from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth import login
from .models import User, Workspace, WorkspaceMember, MembershipRole
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    LoginSerializer,
    WorkspaceSerializer,
    WorkspaceMemberSerializer,
    WorkspaceMemberRoleSerializer,
)
from .permissions import (
    IsAuthenticated,
    TenantAccessPermission,
    IsWorkspaceAdmin,
    IsWorkspaceManager,
)
from .entitlements import check_member_limit


def _current_tenant(request):
    return getattr(request, "tenant", None)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"user": UserSerializer(user).data, "token": token.key},
            status=status.HTTP_201_CREATED,
        )


class LoginView(generics.GenericAPIView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"user": UserSerializer(user).data, "token": token.key})


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class WorkspaceListCreateView(generics.ListCreateAPIView):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Workspace.objects.filter(members__user=self.request.user).distinct()

    def perform_create(self, serializer):
        workspace = serializer.save(owner=self.request.user)
        WorkspaceMember.objects.create(
            user=self.request.user, workspace=workspace, role=MembershipRole.ADMIN
        )


class WorkspaceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WorkspaceSerializer
    permission_classes = [TenantAccessPermission, IsWorkspaceAdmin]

    def get_queryset(self):
        return Workspace.objects.all()

    def perform_destroy(self, instance):
        if instance.owner != self.request.user:
            raise PermissionDenied("Only the workspace owner can delete it.")
        instance.delete()


class WorkspaceMemberListView(generics.ListCreateAPIView):
    serializer_class = WorkspaceMemberSerializer
    permission_classes = [TenantAccessPermission, IsWorkspaceManager]

    def get_queryset(self):
        tenant = _current_tenant(self.request)
        return WorkspaceMember.objects.filter(workspace=tenant)

    def perform_create(self, serializer):
        tenant = _current_tenant(self.request)
        check_member_limit(tenant)
        serializer.save(workspace=tenant)


class WorkspaceMemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WorkspaceMemberSerializer
    permission_classes = [TenantAccessPermission, IsWorkspaceAdmin]

    def get_queryset(self):
        tenant = _current_tenant(self.request)
        return WorkspaceMember.objects.filter(workspace=tenant)

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return WorkspaceMemberRoleSerializer
        return WorkspaceMemberSerializer
