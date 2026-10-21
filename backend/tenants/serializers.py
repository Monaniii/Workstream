from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User, Workspace, WorkspaceMember


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "username", "avatar_url", "date_joined")
        read_only_fields = ("id", "date_joined")


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


class WorkspaceSerializer(serializers.ModelSerializer):
    owner_email = serializers.EmailField(source="owner.email", read_only=True)
    member_count = serializers.IntegerField(read_only=True, default=0)

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
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "owner", "created_at", "updated_at")


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = ("id", "user", "user_email", "role", "joined_at")
        read_only_fields = ("id", "joined_at")


class WorkspaceMemberRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkspaceMember
        fields = ("role",)
