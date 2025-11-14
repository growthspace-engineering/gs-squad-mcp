import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { SquadService } from '@gs-squad-mcp/core/mcp';

describe('AppModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ AppModule ]
    }).compile();
  });

  it('should boot without error', () => {
    expect(module).toBeDefined();
  });

  it('should provide SquadService', () => {
    const squadService = module.get<SquadService>(SquadService);
    expect(squadService).toBeDefined();
  });
});

