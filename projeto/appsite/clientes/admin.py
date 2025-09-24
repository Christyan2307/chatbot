from django.contrib import admin
from .models import Cliente

@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ('id', 'nome', 'telefone', 'status', 'precisa_notificacao')
    list_filter = ('status', 'precisa_notificacao')
    search_fields = ('nome', 'telefone')
