# Backend Architecture

This project is a **NestJS** application using **Drizzle ORM** against **NeonDB**, organised into feature modules. Each domain is self-contained — its own module, controller, service, schema, and DTOs.

> **All code snippets, filenames, type names, and module names are illustrative examples only.**
> Replace them with your own domain and resource names. The patterns and rules are prescriptive — the names are not.

---

## Hard requirements

- **600 line limit** — no file may exceed 600 lines. Ever. If a file approaches this, split it.
- **No manual params in services** — every input to a service method must come from a DTO.
- **No raw values in services** — services never define their own types, interfaces, or inline param shapes. Those live in DTOs.
- **No tight coupling between services** — a service never imports the internals of another service. It calls it through its public interface only and does not care how it works.
- **No direct DB access outside schemas** — controllers and services never import or call Drizzle directly. All DB interaction goes through a schema file.

---

## Module structure

Each feature is a self-contained module. All files for a domain live together.

> Illustrative structure — replace `your-resource` with your domain name.

```
src/
├── your-resource/
│   ├── your-resource.module.ts        ← wires everything together
│   ├── your-resource.controller.ts    ← handles HTTP, delegates to service
│   ├── your-resource.service.ts       ← business logic, calls schema
│   ├── your-resource.schema.ts        ← all DB queries for this domain
│   └── dto/
│       ├── create-your-resource.dto.ts
│       ├── update-your-resource.dto.ts
│       └── your-resource-response.dto.ts
├── common/
│   ├── middleware/
│   │   └── auth.middleware.ts         ← resolves auth context, attaches to request
│   └── decorators/
│       └── auth-context.decorator.ts  ← extracts auth context in controllers
└── database/
    └── database.module.ts             ← Drizzle client, exported for injection
```

---

## Layer responsibilities

| Layer          | Responsibility                                                                       | Never does                                                                          |
| -------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Controller** | Receives HTTP request, validates via DTO, calls service, returns response            | Business logic, DB access, auth resolution                                          |
| **Service**    | Orchestrates business logic, calls schema methods, calls other services by interface | Direct DB queries, manual param definitions, knowledge of other services' internals |
| **Schema**     | All Drizzle queries for one domain — the only place that touches the DB              | Business logic, HTTP concerns, calling other schemas directly                       |
| **DTO**        | Defines and validates the shape of all inputs and outputs                            | Logic of any kind                                                                   |
| **Middleware** | Resolves auth context from the request, attaches it for downstream use               | Business logic, DB access                                                           |

---

## Database module

Set up Drizzle once against NeonDB and export it for injection across all feature modules.

> Example only — adapt NeonDB connection config and schema imports to your project.

```typescript
// database/database.module.ts
import { Global, Module } from '@nestjs/common';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export const DRIZZLE = Symbol('DRIZZLE');

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () => {
        const sql = neon(process.env.DATABASE_URL!);
        return drizzle(sql);
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
```

---

## Schema files — DB access layer

The schema file is the **only** place Drizzle is called. It owns the table definition and every query against it. Services inject the schema and call its methods — they never write a Drizzle query directly.

One schema file per domain. If a schema file approaches 600 lines, split queries into focused files (e.g. `your-resource.queries.read.ts`, `your-resource.queries.write.ts`) and re-export from the schema.

> Example only — replace table name, columns, and query logic with your own.

```typescript
// your-resource/your-resource.schema.ts
import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { DRIZZLE } from '~/database/database.module';
import type { DrizzleClient } from '~/database/database.types'; // define this per project
import type { CreateYourResourceDto } from './dto/create-your-resource.dto';
import type { UpdateYourResourceDto } from './dto/update-your-resource.dto';

// Table definition — one per schema file
export const yourResourceTable = pgTable('your_resource', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

@Injectable()
export class YourResourceSchema {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async findAllByOrg(orgId: string) {
    return this.db
      .select()
      .from(yourResourceTable)
      .where(eq(yourResourceTable.orgId, orgId));
  }

  async findById(id: string, orgId: string) {
    const [row] = await this.db
      .select()
      .from(yourResourceTable)
      .where(
        and(eq(yourResourceTable.id, id), eq(yourResourceTable.orgId, orgId)),
      );
    return row ?? null;
  }

  async create(dto: CreateYourResourceDto) {
    const [row] = await this.db
      .insert(yourResourceTable)
      .values(dto)
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateYourResourceDto) {
    const [row] = await this.db
      .update(yourResourceTable)
      .set(dto)
      .where(eq(yourResourceTable.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string) {
    await this.db.delete(yourResourceTable).where(eq(yourResourceTable.id, id));
  }
}
```

---

## DTOs — input and output shapes

DTOs are the **only** way data enters or leaves a service. Services never define inline parameter types or accept raw primitives when a DTO should exist. Use **Zod** schemas for API request validation.

> Example only — replace class names and fields with your own resource shape.

```typescript
// your-resource/dto/create-your-resource.dto.ts
import { z } from 'zod';

export const createYourResourceSchema = z.object({
  orgId: z.uuid(),
  name: z.string().trim().min(1).max(255),
});

export type CreateYourResourceDto = z.infer<typeof createYourResourceSchema>;
```

```typescript
// your-resource/dto/update-your-resource.dto.ts
import { createYourResourceSchema } from './create-your-resource.dto';

export const updateYourResourceSchema = createYourResourceSchema.partial();

export type UpdateYourResourceDto = z.infer<typeof updateYourResourceSchema>;
```

```typescript
// your-resource/dto/your-resource-response.dto.ts
// Defines the shape returned to the client — never expose raw DB rows
export class YourResourceResponseDto {
  id: string;
  orgId: string;
  name: string;
  createdAt: Date;
}
```

**Rules:**

- Every service method input is a DTO — no `(id: string, name: string, orgId: string)` signatures
- Every service method output is typed to a DTO or mapped to one before returning
- Zod schemas define API validation and derived DTO types
- DTO files contain request/response shapes only; business logic stays in services
- Database constraints still enforce impossible states at the NeonDB layer

---

## Service — business logic layer

Services orchestrate logic. They call schema methods for DB access and may call other services through their public interface. They never write Drizzle queries, never define inline param shapes, and never reach into another service's internals.

> Example only — replace resource name, method names, and logic with your own.

```typescript
// your-resource/your-resource.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { YourResourceSchema } from './your-resource.schema';
import { CreateYourResourceDto } from './dto/create-your-resource.dto';
import { UpdateYourResourceDto } from './dto/update-your-resource.dto';
import { YourResourceResponseDto } from './dto/your-resource-response.dto';
import type { AuthContext } from '~/common/middleware/auth.middleware';

@Injectable()
export class YourResourceService {
  constructor(private readonly schema: YourResourceSchema) {}

  async findAll(auth: AuthContext): Promise<YourResourceResponseDto[]> {
    return this.schema.findAllByOrg(auth.orgId);
  }

  async findById(
    id: string,
    auth: AuthContext,
  ): Promise<YourResourceResponseDto> {
    const resource = await this.schema.findById(id, auth.orgId);
    if (!resource) throw new NotFoundException(`Resource ${id} not found`);
    return resource;
  }

  async create(dto: CreateYourResourceDto): Promise<YourResourceResponseDto> {
    return this.schema.create(dto);
  }

  async update(
    id: string,
    dto: UpdateYourResourceDto,
  ): Promise<YourResourceResponseDto> {
    const resource = await this.schema.update(id, dto);
    if (!resource) throw new NotFoundException(`Resource ${id} not found`);
    return resource;
  }

  async delete(id: string): Promise<void> {
    await this.schema.delete(id);
  }
}
```

**Calling another service — abstraction rule:**

```typescript
// ✅ correct — calls the other service's public method, doesn't care how it works
constructor(
  private readonly schema: YourResourceSchema,
  private readonly otherService: OtherService,
) {}

async doSomething(dto: SomeDto): Promise<ResultDto> {
  const related = await this.otherService.findById(dto.relatedId);
  // ...
}

// ❌ wrong — importing internals of another service's schema or reaching into its DB layer
import { OtherResourceSchema } from '../other-resource/other-resource.schema';
```

---

## Middleware — auth context

Middleware resolves auth context from the incoming request and attaches it so controllers and services can consume it without re-resolving.

> Example only — adapt JWT extraction and session resolution to your auth provider.

```typescript
// common/middleware/auth.middleware.ts
import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export interface AuthContext {
  userId: string;
  orgId: string;
  role: 'admin' | 'member' | 'viewer'; // extend to match your roles
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(
    req: Request & { auth?: AuthContext },
    res: Response,
    next: NextFunction,
  ) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedException();

    // Resolve your session here — adapt to your auth provider
    const session = resolveSession(token); // implement per project
    if (!session) throw new UnauthorizedException();

    req.auth = {
      userId: session.userId,
      orgId: session.orgId,
      role: session.role,
    };

    next();
  }
}
```

Apply middleware in each feature module:

```typescript
// your-resource/your-resource.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthMiddleware } from '~/common/middleware/auth.middleware';
import { YourResourceController } from './your-resource.controller';
import { YourResourceService } from './your-resource.service';
import { YourResourceSchema } from './your-resource.schema';

@Module({
  controllers: [YourResourceController],
  providers: [YourResourceService, YourResourceSchema],
})
export class YourResourceModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(YourResourceController);
  }
}
```

Extract auth context cleanly in controllers using a decorator:

```typescript
// common/decorators/auth-context.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '~/common/middleware/auth.middleware';

export const Auth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth;
  },
);
```

---

## Controller — HTTP layer

Controllers handle HTTP only. They receive a request, pass it to the service via DTO, and return the response. No business logic, no DB access, no auth resolution.

> Example only — replace resource name, routes, and DTO names with your own.

```typescript
// your-resource/your-resource.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { YourResourceService } from './your-resource.service';
import { CreateYourResourceDto } from './dto/create-your-resource.dto';
import { UpdateYourResourceDto } from './dto/update-your-resource.dto';
import { Auth } from '~/common/decorators/auth-context.decorator';
import type { AuthContext } from '~/common/middleware/auth.middleware';

@Controller('your-resource')
export class YourResourceController {
  constructor(private readonly service: YourResourceService) {}

  @Get()
  findAll(@Auth() auth: AuthContext) {
    return this.service.findAll(auth);
  }

  @Get(':id')
  findById(@Param('id') id: string, @Auth() auth: AuthContext) {
    return this.service.findById(id, auth);
  }

  @Post()
  create(@Body() dto: CreateYourResourceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateYourResourceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
```

---

## 600 line limit — how to split

When any file approaches 600 lines, split it before it exceeds the limit.

| File type  | How to split                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Service    | Extract into focused sub-services (e.g. `your-resource-query.service.ts`, `your-resource-command.service.ts`) and compose them |
| Schema     | Split into read/write files and re-export from the main schema file                                                            |
| Controller | Split by route group into sub-controllers and register both in the module                                                      |
| DTO folder | Already split by operation — if a DTO file grows, extract nested types into a `types/` file alongside                          |

---

## Decision cheatsheet

| Scenario                                  | Where it lives                          |
| ----------------------------------------- | --------------------------------------- |
| Drizzle table definition                  | Schema file                             |
| DB query (select, insert, update, delete) | Schema file                             |
| Business logic, validation, orchestration | Service                                 |
| Calling another domain's logic            | Service → other service's public method |
| HTTP routing, request/response            | Controller                              |
| Input shape + validation                  | DTO                                     |
| Output shape                              | Response DTO                            |
| JWT / session resolution                  | Middleware                              |
| Extracting auth context in a controller   | Decorator                               |
| Wiring module together                    | Module file                             |
