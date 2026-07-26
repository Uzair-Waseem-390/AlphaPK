from rest_framework import serializers


class BackupManifestModelSerializer(serializers.Serializer):
    label = serializers.CharField()
    count = serializers.IntegerField()


class RemoteBackupResultSerializer(serializers.Serializer):
    backup_type      = serializers.CharField()
    covers_from      = serializers.DateTimeField(allow_null=True)
    covers_to        = serializers.DateTimeField()
    row_count        = serializers.IntegerField()
    models           = BackupManifestModelSerializer(many=True)
    schema_migrated  = serializers.BooleanField()
