from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User, Workspace, WorkspaceMember, MembershipRole


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "avatar_url",
            "is_staff",
            "is_superuser",
            "must_change_password",
            "date_joined",
        )
        read_only_fields = (
            "id",
            "date_joined",
            "is_staff",
            "is_superuser",
            "must_change_password",
        )


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("id", "email", "username", "password", "avatar_url")

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            email=validated_data["email"],
            username=validated_data.get("username", validated_data["email"]),
            password=validated_data["password"],
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["email"],
            password=attrs["password"],
        )
        if not user:
            raise serializers.ValidationError("Invalid credentials")
        attrs["user"] = user
        return attrs

class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value
    def validate(self, attrs):
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": "Choose a password different from the current one."}
            )
        return attrs


class WorkspaceSerializer(serializers.ModelSerializer):
    owner_email = serializers.EmailField(source="owner.email", read_only=True)
    member_count = serializers.IntegerField(read_only=True, default=0)
    current_user_role = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = (
            "id",
            "name",
            "slug",
            "owner",
            "owner_email",
            "plan",
            "member_count",
            "current_user_role",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "owner", "created_at", "updated_at")

    def get_current_user_role(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        membership = obj.members.filter(user=request.user).only("role").first()
        return membership.role if membership else None


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    must_change_password = serializers.BooleanField(
        source="user.must_change_password", read_only=True
    )

    class Meta:
        model = WorkspaceMember
        fields = (
            "id",
            "user",
            "user_email",
            "role",
            "must_change_password",
            "joined_at",
        )
        read_only_fields = ("id", "joined_at")


class WorkspaceMemberProvisionSerializer(serializers.Serializer):
    """Admin-side account creation: the user does not register themselves."""

    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=MembershipRole.choices, default=MembershipRole.MEMBER
    )
    first_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    last_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )

    def validate_email(self, value):
        email = value.strip().lower()
        workspace = self.context["workspace"]
        existing = User.objects.filter(email__iexact=email).first()
        if existing:
            if WorkspaceMember.objects.filter(
                workspace=workspace, user=existing
            ).exists():
                raise serializers.ValidationError(
                    "This user is already a member of the workspace."
                )
            raise serializers.ValidationError(
                "An account with this email already exists. Use a different email."
            )
        return email


class WorkspaceMemberRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkspaceMember
        fields = ("role",)
