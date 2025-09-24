from django.shortcuts import render, redirect
from .models import Cliente
from .forms import ClienteForm

def lista_clientes(request):
    clientes = Cliente.objects.all()
    return render(request, "clientes/lista.html", {"clientes": clientes})

def novo_cliente(request):
    if request.method == "POST":
        form = ClienteForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect("lista_clientes")
    else:
        form = ClienteForm()
    return render(request, "clientes/novo.html", {"form": form})
