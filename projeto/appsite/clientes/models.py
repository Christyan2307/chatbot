from django.db import models

class Cliente(models.Model):
    STATUS_CHOICES = [
        ("andamento", "Em andamento"),
        ("aprovado", "Aprovado"),
        ("cancelado", "Cancelado"),
    ]

    nome = models.CharField(max_length=100)
    telefone = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    precisa_notificacao = models.BooleanField(default=True)

    class Meta:
        db_table = 'clientes'  # <- casa com o SELECT do seu bot

    def save(self, *args, **kwargs):
        # Se o status mudar, marca para notificar de novo
        if self.pk:
            antigo = type(self).objects.get(pk=self.pk)
            if antigo.status != self.status:
                self.precisa_notificacao = True
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome} ({self.status})"
