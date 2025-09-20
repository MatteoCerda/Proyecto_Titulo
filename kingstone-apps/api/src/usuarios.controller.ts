import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly svc: UsuariosService) {}

  @Post()
  create(@Body() dto: CreateUsuarioDto) {
    return this.svc.create(dto.email, dto.nombre, dto.password);
  }

  @Get()
  list() {
    return this.svc.findAll();
  }
}
