/**
 * Módulo Centralizado de Validação e Sanitização de Entradas (P4)
 */

function validatePhone(phone) {
    if (!phone) throw new Error('Telefone é obrigatório');
    const clean = String(phone).replace(/\D/g, '');
    if (clean.length < 10 || clean.length > 15) {
        throw new Error(`Telefone inválido: ${phone}`);
    }
    return clean;
}

function validateName(name) {
    if (!name) return 'Paciente';
    const trimmed = String(name).trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
        throw new Error(`Nome deve ter entre 2 e 100 caracteres: ${name}`);
    }
    return trimmed;
}

function validateCpf(cpf) {
    if (!cpf) throw new Error('CPF é obrigatório');
    const clean = String(cpf).replace(/\D/g, '');
    if (clean.length !== 11) {
        throw new Error('CPF deve conter exatamente 11 dígitos');
    }
    if (/^(\d)\1{10}$/.test(clean)) {
        throw new Error('CPF com dígitos repetidos é inválido');
    }
    return clean;
}

module.exports = {
    validatePhone,
    validateName,
    validateCpf
};
